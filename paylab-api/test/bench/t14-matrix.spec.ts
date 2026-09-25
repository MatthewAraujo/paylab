import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { safeId } from '@/domain/benchmark/summary'
import {
	type LoadLine,
	T14_CELLS,
	T14_PROTOCOL,
	aggregateRuns,
	cellMetrics,
	strategyOrder,
} from '../../bench/scenarios/t14-matrix'

// The real measurements of the T14 experiment: an independent source of truth.
const RAW = readFileSync(join(process.cwd(), 'docs/experiments/raw/T14-load.jsonl'), 'utf8')
	.trim()
	.split('\n')
	.map((line) => JSON.parse(line) as LoadLine)

describe('T14 protocol and cells', () => {
	it('is the accepted protocol: 2 s warm-up, 10 s window, 3 repetitions, median', () => {
		expect(T14_PROTOCOL).toEqual({
			warmupMs: 2000,
			durationMs: 10000,
			repetitions: 3,
			aggregation: 'median',
		})
	})

	it('has the 16 cells of the matrix, synchronous_commit=off first, with safe unique ids', () => {
		expect(T14_CELLS).toHaveLength(16)
		expect(T14_CELLS.map((c) => c.index)).toEqual([...Array(16).keys()])
		expect(T14_CELLS.slice(0, 8).map((c) => `${c.shape}${c.clients}:${c.sync}`)).toEqual([
			'H4:off',
			'H16:off',
			'H64:off',
			'W16:off',
			'W64:off',
			'M4:off',
			'M16:off',
			'M64:off',
		])
		expect(T14_CELLS.slice(8).every((c) => c.sync === 'on')).toBe(true)
		expect(new Set(T14_CELLS.map((c) => c.id)).size).toBe(16)
		for (const cell of T14_CELLS) expect(safeId.safeParse(cell.id).success, cell.id).toBe(true)
	})
})

describe('strategyOrder (Latin-square rotation)', () => {
	it('starts each block at a different strategy for every repetition', () => {
		expect(strategyOrder(0, 1)).toEqual([
			'forupdate',
			'serializable',
			'optimistic',
			'advisory',
			'nokey',
		])
		for (const cell of T14_CELLS) {
			const firsts = [1, 2, 3].map((rep) => strategyOrder(cell.index, rep)[0])
			expect(new Set(firsts).size, cell.id).toBe(3)
		}
	})

	it('reproduces the order of all 48 blocks of the recorded experiment', () => {
		const blocks = new Map<string, string[]>()
		for (const line of RAW) {
			const key = `${line.rep}|${line.sync}|${line.shape}|${line.clients}`
			blocks.set(key, [...(blocks.get(key) ?? []), line.strategy])
		}

		expect(blocks.size).toBe(48)
		for (const cell of T14_CELLS) {
			for (const rep of [1, 2, 3]) {
				const recorded = blocks.get(`${rep}|${cell.sync}|${cell.shape}|${cell.clients}`)
				expect(strategyOrder(cell.index, rep), `${cell.id} rep ${rep}`).toEqual(recorded)
			}
		}
	})
})

describe('aggregateRuns', () => {
	const line = (over: Partial<LoadLine>): LoadLine => ({ ...RAW[0], ...over })

	it('takes the median of each field over the repetitions, and the range of throughput', () => {
		const lines = [
			line({ tps: 10, p99: 30 }),
			line({ tps: 30, p99: 10 }),
			line({ tps: 20, p99: 20 }),
		]

		const aggregate = aggregateRuns(lines)

		expect(aggregate.tps).toEqual({ median: 20, min: 10, max: 30 })
		expect(aggregate.p99.median).toBe(20)
	})

	it('reproduces a published cell: shape H, synchronous_commit=on, 4 clients, nokey', () => {
		// docs/experiments/raw/T14-summary-tables.md: "62.1 (49.8-91.1)"
		const cell = RAW.filter(
			(l) => l.shape === 'H' && l.sync === 'on' && l.clients === 4 && l.strategy === 'nokey',
		)

		expect(cell).toHaveLength(3)
		expect(aggregateRuns(cell).tps).toEqual({ median: 62.1, min: 49.8, max: 91.1 })
	})

	it('ignores a counter that was not recorded in some repetition', () => {
		const lines = [line({ pgRollbacks: null }), line({ pgRollbacks: 8 }), line({ pgRollbacks: 4 })]

		expect(aggregateRuns(lines).pgRollbacks.median).toBe(6)
		expect(aggregateRuns([line({ pgRollbacks: null })]).pgRollbacks).toBeUndefined()
	})
})

describe('cellMetrics', () => {
	const cell = (shape: string, strategy: string) =>
		RAW.filter(
			(l) => l.shape === shape && l.sync === 'on' && l.clients === 16 && l.strategy === strategy,
		)

	it('normalizes every measured field of a debit-only shape under the strategy dimension', () => {
		const metrics = cellMetrics('nokey', 'H', cell('H', 'nokey'))
		const keys = metrics.map((m) => m.key)

		for (const expected of [
			'tps',
			'tps_min',
			'tps_max',
			'latency_p50_ms',
			'latency_p95_ms',
			'latency_p99_ms',
			'attempts_per_success',
			'serialization_failures',
			'version_conflicts',
			'deadlocks',
			'exhausted_operations',
			'errors',
			'failed_payments',
			'lock_acquire_mean_ms',
			'lock_acquire_p95_ms',
			'lock_waiters_avg',
			'pg_rollbacks',
			'pg_deadlocks',
			'lock_samples',
		]) {
			expect(keys, expected).toContain(expected)
		}
		expect(metrics.every((m) => m.dimensions?.strategy === 'nokey')).toBe(true)
		expect(new Set(keys).size).toBe(keys.length)
		expect(metrics.every((m) => Number.isFinite(m.value))).toBe(true)
	})

	it('leaves credit-side and debit-split metrics absent, not zero, where the shape has no credits', () => {
		const keys = cellMetrics('nokey', 'H', cell('H', 'nokey')).map((m) => m.key)

		expect(keys.some((key) => key.startsWith('credit_'))).toBe(false)
		expect(keys.some((key) => key.startsWith('debit_'))).toBe(false)
	})

	it('adds the debit and credit split for the mixed shape', () => {
		const keys = cellMetrics('nokey', 'M', cell('M', 'nokey')).map((m) => m.key)

		for (const expected of [
			'debit_tps',
			'credit_tps',
			'debit_latency_p99_ms',
			'credit_latency_p99_ms',
		]) {
			expect(keys, expected).toContain(expected)
		}
	})

	it('declares the direction of each metric', () => {
		const metrics = cellMetrics('nokey', 'H', cell('H', 'nokey'))
		const direction = (key: string) => metrics.find((m) => m.key === key)?.direction

		expect(direction('tps')).toBe('HIGHER_IS_BETTER')
		expect(direction('latency_p99_ms')).toBe('LOWER_IS_BETTER')
		expect(direction('deadlocks')).toBe('LOWER_IS_BETTER')
		expect(direction('lock_samples')).toBe('NEUTRAL')
	})

	it('features throughput and p99 only for the strategy in production', () => {
		const roles = (strategy: string) =>
			cellMetrics(strategy as never, 'H', cell('H', strategy))
				.filter((m) => m.summaryRole)
				.map((m) => [m.key, m.summaryRole])

		expect(roles('nokey')).toEqual([
			['tps', 'THROUGHPUT'],
			['latency_p99_ms', 'LATENCY_P99'],
		])
		expect(roles('serializable')).toEqual([])
	})
})
