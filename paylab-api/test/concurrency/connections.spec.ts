import { createPools } from '../support/database'

describe('Concurrency infrastructure', () => {
	test('independent pools run queries in parallel on the same database', async () => {
		const pools = createPools(2)

		try {
			const started = Date.now()
			const pids = await Promise.all(
				pools.map(async (pool) => {
					const { rows } = await pool.query('SELECT pg_backend_pid() AS pid, pg_sleep(0.5)')
					return rows[0].pid as number
				}),
			)
			const elapsed = Date.now() - started

			expect(new Set(pids).size).toBe(2)
			expect(elapsed).toBeLessThan(950)
		} finally {
			await Promise.all(pools.map((pool) => pool.end()))
		}
	})
})
