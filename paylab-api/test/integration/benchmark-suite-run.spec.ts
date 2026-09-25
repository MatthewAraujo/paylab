import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Strategy } from '../../bench/exp/strategies/strategies'
import { snapshotTemplate } from '../../bench/lib/reset'
import { runBenchmark } from '../../scripts/benchmark/executor'
import { buildSuite, t14Scenarios } from '../../scripts/benchmark/suite'
import {
	benchDatabase,
	createSeededDatabase,
	dropDatabases,
	urlFor,
} from '../support/bench-database'
import { type TempRepo, createTempRepo } from '../support/git-repo'

// The reduced end-to-end Run: real preflight over a template, real scenario processes, real
// plans. Only two of the registered scenarios run; the full suite is a documented manual run.
describe('benchmark:run against a small dataset (reduced suite)', () => {
	const database = benchDatabase('paylab_bench_it_run')
	const chosen = ['t13.history.first-page.hot-wallet', 't13.report.30d.cold-merchant']
	let repo: TempRepo
	let previousUrl: string | undefined

	beforeAll(async () => {
		await createSeededDatabase(database.name)
		await snapshotTemplate(database)
		previousUrl = process.env.BENCH_DATABASE_URL
		process.env.BENCH_DATABASE_URL = urlFor(database.name)
		repo = createTempRepo()
	}, 300_000)

	afterAll(async () => {
		if (previousUrl === undefined) Reflect.deleteProperty(process.env, 'BENCH_DATABASE_URL')
		else process.env.BENCH_DATABASE_URL = previousUrl
		repo.cleanup()
		await dropDatabases(database.name, database.templateName)
	})

	it('publishes a COMPLETED Run with structured T13 metrics, plans, and the dataset gate', async () => {
		const full = buildSuite(database)
		const suite = {
			...full,
			scenarios: full.scenarios.filter((s) => chosen.includes(s.definition.id)),
		}

		const { summary } = await runBenchmark({
			repoDir: repo.repoDir,
			artifactRoot: repo.artifactRoot,
			summaryDir: repo.summaryDir,
			executorVersion: 'test',
			suite,
			note: 'reduced integration run',
		})

		expect(summary.status).toBe('COMPLETED')
		expect(summary.dataset.fingerprint).toMatch(/^[0-9a-f]{32}$/)
		expect(summary.dataset.description).toContain('10200 payments')
		expect(summary.environment.details.postgres).toMatch(/^16\./)

		expect(summary.scenarios.map((s) => s.id)).toEqual(chosen)
		for (const scenario of summary.scenarios) {
			expect(scenario.protocol).toEqual({ warmupRuns: 1, repetitions: 7, aggregation: 'median' })
			expect(scenario.metrics.map((m) => m.key)).toEqual([
				'query_latency_median_ms',
				'query_latency_min_ms',
				'query_latency_max_ms',
			])
		}

		const plans = summary.artifacts.filter((a) => a.kind === 'QUERY_PLAN')
		expect(plans.map((a) => a.scenarioId)).toEqual(chosen)
		for (const plan of plans) {
			const file = join(
				repo.artifactRoot,
				'runs',
				summary.runId,
				'artifacts',
				`${plan.id}.plan.txt`,
			)
			expect(existsSync(file)).toBe(true)
			expect(readFileSync(file, 'utf8')).toContain('Execution Time')
		}
	}, 180_000)

	describe('the reduced T14 group', () => {
		const cell = {
			id: 't14.load.M.c2.sync-off',
			shape: 'M',
			clients: 2,
			sync: 'off',
			index: 0,
		} as const
		const protocol = { warmupMs: 0, durationMs: 1000, repetitions: 1 }
		const run = (gateStrategies: Strategy[]) => {
			const full = buildSuite(database)
			return runBenchmark({
				repoDir: repo.repoDir,
				artifactRoot: repo.artifactRoot,
				summaryDir: repo.summaryDir,
				executorVersion: 'test',
				suite: {
					prepare: full.prepare,
					scenarios: t14Scenarios(database, { cells: [cell], protocol, gateStrategies }),
				},
			})
		}

		const commit = () => {
			repo.git('add', '-A')
			repo.git('commit', '-q', '-m', 'publish')
		}

		it('publishes the correctness gate and a cell with per-strategy metrics and raw samples', async () => {
			commit()

			const { summary } = await run(['nokey'])

			expect(summary.status).toBe('COMPLETED')
			expect(summary.scenarios.map((s) => s.id)).toEqual(['t14.correctness', cell.id])

			const gate = summary.scenarios[0].metrics
			expect(gate.find((m) => m.key === 'correctness_violations')?.value).toBe(0)
			expect(gate.every((m) => m.dimensions?.strategy === 'nokey')).toBe(true)

			const measured = summary.scenarios[1].metrics
			expect(measured.filter((m) => m.key === 'tps').map((m) => m.dimensions?.strategy)).toEqual([
				'nokey',
				'forupdate',
				'serializable',
				'optimistic',
				'advisory',
			])
			expect(
				measured.find((m) => m.key === 'tps' && m.dimensions?.strategy === 'nokey')?.summaryRole,
			).toBe('THROUGHPUT')

			const raw = summary.artifacts.filter((a) => a.kind === 'RAW_DATA')
			expect(raw.map((a) => a.id)).toEqual(['t14.correctness-correctness', `${cell.id}-samples`])
			const samples = readFileSync(
				join(repo.artifactRoot, 'runs', summary.runId, 'artifacts', `${cell.id}-samples.jsonl`),
				'utf8',
			)
				.trim()
				.split('\n')
			expect(samples).toHaveLength(5)
			expect(JSON.parse(samples[0])).toMatchObject({ shape: 'M', clients: 2, rep: 1 })
		}, 300_000)

		it('leaves the Run INCOMPLETE and skips the matrix when the correctness gate fails', async () => {
			commit()

			// A strategy that takes no lock overspends the Wallet: a genuine correctness failure.
			const { summary } = await run(['unprotected' as Strategy])

			expect(summary.status).toBe('INCOMPLETE')
			expect(summary.scenarios.map((s) => [s.id, s.status])).toEqual([
				['t14.correctness', 'FAILED'],
				[cell.id, 'PENDING'],
			])
			expect(summary.failure?.scenarioId).toBe('t14.correctness')
			expect(summary.failure?.summary).toContain('Correctness gate failed')
		}, 300_000)
	})
})
