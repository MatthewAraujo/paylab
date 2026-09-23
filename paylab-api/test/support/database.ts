import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

export const prisma = new PrismaClient({
	datasourceUrl: process.env.DATABASE_URL,
})

// Prisma's migration history must survive a reset. `accounts` and `merchants` are
// emptied with DELETE instead of TRUNCATE so the External Clearing Account seeded
// by the baseline migration survives (TRUNCATE would also need to include tables
// referencing them, and would drop the seeded row).
const PRESERVED_TABLES = ['_prisma_migrations']
const DELETED_TABLES = ['accounts', 'merchants']

// Empties application data between tests, keeping migration-seeded reference data.
// TRUNCATE is used on purpose for the rest: it is not covered by the ledger's row
// triggers (see T4) and is much cheaper than DELETE.
export async function resetDatabase() {
	const rows = await prisma.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
	const truncated = rows
		.map((row) => row.tablename)
		.filter((name) => !PRESERVED_TABLES.includes(name) && !DELETED_TABLES.includes(name))

	if (truncated.length > 0) {
		const list = truncated.map((name) => `"${name}"`).join(', ')
		await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY`)
	}

	// Wallets first (they reference merchants); the clearing Account has no Merchant.
	await prisma.$executeRawUnsafe('DELETE FROM accounts WHERE merchant_id IS NOT NULL')
	await prisma.$executeRawUnsafe('DELETE FROM merchants')
}

// True when the history table exists and every migration in it finished.
export async function migrationsApplied() {
	const [{ exists }] = await prisma.$queryRaw<{ exists: boolean }[]>`
		SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS exists`
	if (!exists) {
		return false
	}

	const [{ pending }] = await prisma.$queryRaw<{ pending: bigint }[]>`
		SELECT count(*) AS pending FROM _prisma_migrations WHERE finished_at IS NULL`
	return pending === 0n
}

// Independent connection pools against the same database, for tests that need
// several real concurrent connections. The caller ends them.
export function createPools(count: number) {
	return Array.from(
		{ length: count },
		() => new Pool({ connectionString: process.env.DATABASE_URL, max: 1 }),
	)
}
