import {
	T13_PROTOCOL,
	measureQuery,
	median,
	parseExecutionTimeMs,
} from '../../bench/scenarios/measure'

const planWith = (ms: number) =>
	[
		'Limit  (cost=0.43..8.9 rows=21 width=40) (actual time=0.031..0.062 rows=21 loops=1)',
		'  ->  Index Only Scan using ledger_entries_account_created_id_idx on ledger_entries',
		'Planning Time: 0.210 ms',
		`Execution Time: ${ms} ms`,
	].join('\n')

describe('median', () => {
	it('takes the middle of an odd number of values', () => {
		expect(median([3, 1, 2])).toBe(2)
	})

	it('averages the two middle values of an even number', () => {
		expect(median([4, 1, 3, 2])).toBe(2.5)
	})

	it('refuses an empty sample', () => {
		expect(() => median([])).toThrow()
	})
})

describe('parseExecutionTimeMs', () => {
	it('reads the Execution Time line of an EXPLAIN ANALYZE plan', () => {
		expect(parseExecutionTimeMs(planWith(104.312))).toBe(104.312)
	})

	it('fails loudly when the plan has no execution time', () => {
		expect(() => parseExecutionTimeMs('Seq Scan on payments')).toThrow(/Execution Time/)
	})
})

describe('measureQuery', () => {
	it('is the T13 protocol: one warm-up, seven measured executions, median', () => {
		expect(T13_PROTOCOL).toEqual({ warmupRuns: 1, repetitions: 7, aggregation: 'median' })
	})

	it('discards the warm-up and reports the median, range, and last plan of the seven measured runs', async () => {
		const times = [999, 5, 3, 9, 1, 7, 2, 8]
		const seen: string[] = []
		const execute = async (sql: string) => {
			seen.push(sql)
			return planWith(times[seen.length - 1])
		}

		const result = await measureQuery(execute, 'SELECT 1')

		expect(seen).toHaveLength(8)
		expect(result.samplesMs).toEqual([5, 3, 9, 1, 7, 2, 8])
		expect(result.medianMs).toBe(5)
		expect(result.minMs).toBe(1)
		expect(result.maxMs).toBe(9)
		expect(result.plan).toBe(planWith(8))
	})

	it('honors another protocol', async () => {
		const times = [10, 20, 30]
		let calls = 0
		const execute = async () => planWith(times[calls++])

		const result = await measureQuery(execute, 'SELECT 1', {
			warmupRuns: 0,
			repetitions: 3,
			aggregation: 'median',
		})

		expect(calls).toBe(3)
		expect(result.medianMs).toBe(20)
	})
})
