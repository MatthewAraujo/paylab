import { PrismaClient } from '@prisma/client'

export const prisma = new PrismaClient({
	datasourceUrl: process.env.DATABASE_URL,
})

// Prisma's migration history must survive a reset.
const PRESERVED_TABLES = ['_prisma_migrations']

// Empties every application table between tests.
export async function resetDatabase() {
	const rows = await prisma.$queryRaw<{ tablename: string }[]>`
		SELECT tablename FROM pg_tables WHERE schemaname = 'public'`
	const truncated = rows
		.map((row) => row.tablename)
		.filter((name) => !PRESERVED_TABLES.includes(name))

	if (truncated.length > 0) {
		const list = truncated.map((name) => `"${name}"`).join(', ')
		await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`)
	}
}
