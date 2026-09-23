import { PrismaClient } from '@prisma/client'
import { Pool } from 'pg'

export const prisma = new PrismaClient({
	datasourceUrl: process.env.DATABASE_URL,
})

// Tables that must survive a reset: Prisma's own migration history.
const PRESERVED_TABLES = ['_prisma_migrations']

// Empties every application table between tests. TRUNCATE is used on purpose: it
// is not covered by the ledger's row triggers (see T4) and is much cheaper than DELETE.
export async function resetDatabase() {
	const rows = await prisma.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
	const tables = rows.map((row) => row.tablename).filter((name) => !PRESERVED_TABLES.includes(name))

	if (tables.length === 0) {
		return
	}

	const list = tables.map((name) => `"${name}"`).join(', ')
	await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
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
