import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Pool, PoolClient } from 'pg'

export type SeedOptions = {
	seed: string
	/** Requested transfer Payments; one funding Payment per Wallet is added on top. */
	payments: number
	wallets: number
	merchants: number
	/** Transfers inserted per database transaction. */
	batchSize: number
}

export const FULL_SIZE: SeedOptions = {
	seed: 'paylab-benchmark-v1',
	payments: 1_000_000,
	wallets: 1_000,
	merchants: 50,
	batchSize: 50_000,
}

export type SeedTimings = { totalMs: number; steps: Record<string, number> }

const SQL_DIR = join(__dirname, '..', 'sql')
const sql = (file: string) => readFileSync(join(SQL_DIR, file), 'utf8')

async function setParams(client: PoolClient, options: SeedOptions) {
	const settings: Record<string, string> = {
		'bench.seed': options.seed,
		'bench.payments': String(options.payments),
		'bench.wallets': String(options.wallets),
		'bench.merchants': String(options.merchants),
	}
	for (const [name, value] of Object.entries(settings)) {
		await client.query('SELECT set_config($1, $2, false)', [name, value])
	}
}

async function inTransaction(client: PoolClient, file: string) {
	await client.query('BEGIN')
	try {
		await client.query(sql(file))
		await client.query('COMMIT')
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	}
}

function validate(options: SeedOptions) {
	if (options.wallets < 200) {
		throw new Error('wallets must be at least 200 so the top 1% is at least two Wallets')
	}
	if (options.merchants < 1 || options.merchants > options.wallets) {
		throw new Error('merchants must be between 1 and wallets')
	}
	if (options.payments < 1 || options.batchSize < 1) {
		throw new Error('payments and batchSize must be positive')
	}
}

/**
 * Replaces the contents of the connected database with a deterministic, skewed
 * dataset, generated in bulk inside PostgreSQL. Integrity is never weakened: every
 * row goes through the schema's constraints and the deferred ledger triggers, and
 * the loader ends with `VACUUM (ANALYZE)`. The caller decides which database this is.
 */
export async function seedBenchmark(pool: Pool, options: SeedOptions): Promise<SeedTimings> {
	validate(options)
	const started = Date.now()
	const steps: Record<string, number> = {}
	const client = await pool.connect()

	async function step(name: string, action: () => Promise<void>) {
		const at = Date.now()
		await action()
		steps[name] = Date.now() - at
	}

	try {
		await setParams(client, options)
		await client.query(sql('00-functions.sql'))

		await step('reset', () => inTransaction(client, '01-reset.sql'))
		await step('reference', () => inTransaction(client, '02-reference.sql'))
		await step('plan', async () => {
			await client.query(sql('03-plan.sql'))
		})
		await step('funding', () => inTransaction(client, '04-funding.sql'))
		await step('transfers', async () => {
			for (let lo = 0; lo < options.payments; lo += options.batchSize) {
				const hi = Math.min(lo + options.batchSize, options.payments)
				await client.query('SELECT set_config($1, $2, false)', ['bench.lo', String(lo)])
				await client.query('SELECT set_config($1, $2, false)', ['bench.hi', String(hi)])
				await inTransaction(client, '05-transfers.sql')
			}
		})
		await step('finish', () => inTransaction(client, '06-finish.sql'))
		await step('analyze', async () => {
			await client.query('VACUUM (ANALYZE)')
		})
	} finally {
		client.release()
	}

	return { totalMs: Date.now() - started, steps }
}
