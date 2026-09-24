import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { discoverTargets } from '../../bench/lib/targets'
import { T13_PROTOCOL } from '../../bench/scenarios/measure'
import { T13_QUERIES } from '../../bench/scenarios/t13-queries'
import { runReadScenario } from '../../bench/scenarios/t13-reads'
import { createSeededDatabase, dropDatabases, urlFor } from '../support/bench-database'

describe('T13 read scenarios on the small dataset', () => {
	const name = 'paylab_bench_it_t13'
	let pool: Pool

	beforeAll(async () => {
		await createSeededDatabase(name)
		pool = new Pool({ connectionString: urlFor(name), max: 2 })
	}, 240_000)

	afterAll(async () => {
		await pool.end()
		await dropDatabases(name)
	})

	it('discovers deterministic hot and cold targets from the data', async () => {
		const targets = await discoverTargets(pool)

		expect(targets.rowCounts.hotWalletEntries).toBeGreaterThan(targets.rowCounts.coldWalletEntries)
		expect(targets.rowCounts.hotMerchantPayments).toBeGreaterThan(
			targets.rowCounts.coldMerchantPayments,
		)
		expect(targets.transferStartDay).toBe('2026-06-01')
		expect(await discoverTargets(pool)).toEqual(targets)
	})

	it.each(T13_QUERIES.map((query) => [query.id, query] as const))(
		'%s runs and yields normalized latency metrics and its plan',
		async (_id, query) => {
			const result = await runReadScenario(query, pool, { ...T13_PROTOCOL, repetitions: 3 })

			expect(result.plan).toContain('Execution Time')
			expect(result.sql).not.toMatch(/\{\w+\}/)
			expect(result.metrics.map((metric) => metric.key)).toEqual([
				'query_latency_median_ms',
				'query_latency_min_ms',
				'query_latency_max_ms',
			])
			for (const metric of result.metrics) {
				expect(metric.direction).toBe('LOWER_IS_BETTER')
				expect(metric.unit).toBe('ms')
				expect(metric.value).toBeGreaterThanOrEqual(0)
			}
			expect(result.metrics[1].value).toBeLessThanOrEqual(result.metrics[0].value)
			expect(result.metrics[0].value).toBeLessThanOrEqual(result.metrics[2].value)
		},
		60_000,
	)
})
