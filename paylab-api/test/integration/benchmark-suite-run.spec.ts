import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { snapshotTemplate } from '../../bench/lib/reset'
import { runBenchmark } from '../../scripts/benchmark/executor'
import { buildSuite } from '../../scripts/benchmark/suite'
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
})
