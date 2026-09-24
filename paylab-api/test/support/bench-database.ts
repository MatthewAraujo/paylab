import { execFileSync } from 'node:child_process'
import { Client, Pool } from 'pg'
import { inject } from 'vitest'
import type { BenchDatabase } from '../../bench/lib/database'
import { type SeedOptions, seedBenchmark } from '../../bench/lib/seed'

export const SMALL_SEED: SeedOptions = {
	seed: 'small',
	payments: 10_000,
	wallets: 200,
	merchants: 10,
	batchSize: 2_500,
}

/** The Testcontainers server of this test run, addressed as another database on it. */
export function urlFor(name: string): string {
	const url = new URL(inject('databaseUrl') as string)
	url.pathname = `/${name}`
	return url.toString()
}

export function benchDatabase(name: string, templateName = `${name}_template`): BenchDatabase {
	return { url: urlFor(name), name, templateName }
}

async function admin<T>(action: (client: Client) => Promise<T>): Promise<T> {
	const client = new Client({ connectionString: urlFor('postgres') })
	await client.connect()
	try {
		return await action(client)
	} finally {
		await client.end()
	}
}

export async function dropDatabases(...names: string[]) {
	await admin(async (client) => {
		for (const name of names) {
			await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
		}
	})
}

/** A migrated database on the test server, filled with the small deterministic dataset. */
export async function createSeededDatabase(name: string, options: SeedOptions = SMALL_SEED) {
	await dropDatabases(name)
	await admin((client) => client.query(`CREATE DATABASE "${name}"`))
	execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: urlFor(name) },
		stdio: 'pipe',
	})
	const pool = new Pool({ connectionString: urlFor(name), max: 2 })
	try {
		await seedBenchmark(pool, options)
	} finally {
		await pool.end()
	}
}

export async function withPool<T>(name: string, action: (pool: Pool) => Promise<T>): Promise<T> {
	const pool = new Pool({ connectionString: urlFor(name), max: 2 })
	// A restore deliberately terminates connections; that is not a test failure.
	pool.on('error', () => {})
	try {
		return await action(pool)
	} finally {
		await pool.end()
	}
}
