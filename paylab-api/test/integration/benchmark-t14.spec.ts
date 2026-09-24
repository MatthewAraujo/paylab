import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runCorrectness } from '../../bench/exp/strategies/correctness'
import { runLoadBlock } from '../../bench/exp/strategies/load-run'
import type { SettleResult } from '../../bench/exp/strategies/strategies'
import { STRATEGIES } from '../../bench/exp/strategies/strategies'
import { snapshotTemplate } from '../../bench/lib/reset'
import { discoverTargets } from '../../bench/lib/targets'
import { validateDataset } from '../../bench/lib/validate'
import { runCell } from '../../bench/scenarios/t14-cell'
import { strategyOrder } from '../../bench/scenarios/t14-matrix'
import {
	benchDatabase,
	createSeededDatabase,
	dropDatabases,
	urlFor,
	withPool,
} from '../support/bench-database'

// T14 on the small dataset with a reduced matrix (short windows, few repetitions, few clients).
// The accepted production protocol (10 s windows, 3 repetitions) is a documented manual run.
describe('T14 correctness and load matrix (small dataset, reduced)', () => {
	const database = benchDatabase('paylab_bench_it_t14')

	beforeAll(async () => {
		await createSeededDatabase(database.name)
		await snapshotTemplate(database)
	}, 300_000)

	afterAll(async () => {
		await dropDatabases(database.name, database.templateName)
	})

	it('passes the correctness scenarios for strategies that hold, and fails a broken one', async () => {
		const passing = await runCorrectness(['nokey', 'advisory'], { url: database.url })
		expect(passing.map((r) => [r.strategy, r.failures])).toEqual([
			['nokey', []],
			['advisory', []],
		])

		const broken = async (): Promise<SettleResult> => ({
			outcome: 'ERROR',
			attempts: 1,
			serializationFailures: 0,
			versionConflicts: 0,
			deadlocks: 0,
			acquireMs: 0,
			error: 'boom',
		})
		const failing = await runCorrectness(['nokey'], { url: database.url, settleImpl: broken })
		expect(failing[0].failures.length).toBeGreaterThan(0)
	}, 300_000)

	it('measures a load block and reports every field of the driver line', async () => {
		const targets = await withPool(database.name, (pool) => discoverTargets(pool))

		const lines = await runLoadBlock({
			shape: 'H',
			clients: 2,
			strategies: ['nokey', 'advisory'],
			durationS: 1,
			warmupS: 0,
			sync: 'off',
			rep: 1,
			url: database.url,
			hotWalletId: targets.hotWallet,
		})

		expect(lines.map((l) => l.strategy)).toEqual(['nokey', 'advisory'])
		for (const line of lines) {
			expect(line.tps).toBeGreaterThan(0)
			expect(line.windowS).toBe(1)
			expect(line.failedPayments).toBe(0)
			for (const field of [
				'p50',
				'p95',
				'p99',
				'attemptsPerSuccess',
				'avgLockWaiters',
				'samples',
			]) {
				expect(typeof line[field as keyof typeof line], field).toBe('number')
			}
		}
		expect((await validateDataset(database.url)).invariantViolations).toEqual([])
	}, 120_000)

	it('runs a cell: per-repetition reset, rotated strategy order, per-strategy metrics, raw samples', async () => {
		const log: string[] = []
		const cell = {
			id: 't14.load.M.c2.sync-off',
			shape: 'M',
			clients: 2,
			sync: 'off',
			index: 0,
		} as const

		const result = await runCell(cell, {
			database,
			protocol: { warmupMs: 0, durationMs: 1000, repetitions: 2 },
			log: (message) => log.push(message),
		})

		// Two blocks, each preceded by a restore, each in the accepted rotation for that repetition.
		expect(result.lines.map((l) => [l.rep, l.strategy])).toEqual([
			...strategyOrder(0, 1).map((s) => [1, s]),
			...strategyOrder(0, 2).map((s) => [2, s]),
		])
		expect(log.filter((m) => m.startsWith('block '))).toHaveLength(2)

		const strategiesWithTps = result.metrics
			.filter((m) => m.key === 'tps')
			.map((m) => m.dimensions?.strategy)
		expect(strategiesWithTps).toEqual([...STRATEGIES])
		expect(result.metrics.some((m) => m.key === 'credit_tps')).toBe(true)
		expect((await validateDataset(database.url)).invariantViolations).toEqual([])
	}, 300_000)
})
