import { migrationsApplied, prisma, resetDatabase } from '../support/database'

describe('Database infrastructure (integration)', () => {
	beforeAll(async () => {
		await prisma.$executeRawUnsafe(
			'CREATE TABLE IF NOT EXISTS t2_isolation_probe (id int primary key)',
		)
	})

	afterAll(async () => {
		await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS t2_isolation_probe')
	})

	test('connects to the Testcontainers PostgreSQL', async () => {
		const rows = await prisma.$queryRaw<{ one: number }[]>`SELECT 1 AS one`

		expect(rows[0].one).toBe(1)
	})

	test('applies migrations from an empty database', async () => {
		expect(await migrationsApplied()).toBe(true)
	})

	test('first spec writes a row', async () => {
		await prisma.$executeRawUnsafe('INSERT INTO t2_isolation_probe VALUES (1)')

		const rows = await prisma.$queryRawUnsafe<{ id: number }[]>('SELECT id FROM t2_isolation_probe')
		expect(rows).toHaveLength(1)
	})

	test('second spec does not see the previous row after reset', async () => {
		const rows = await prisma.$queryRawUnsafe<{ id: number }[]>('SELECT id FROM t2_isolation_probe')
		expect(rows).toHaveLength(0)
	})

	test('resetDatabase can be called explicitly and is idempotent', async () => {
		await resetDatabase()
		await resetDatabase()
	})
})
