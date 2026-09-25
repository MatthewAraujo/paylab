import { Pool } from 'pg'
import { type BenchDatabase, assertBenchDatabaseUrl } from './database'
import {
	migrateDatabase,
	readTemplateDigest,
	restoreBenchmarkDatabase,
	templateExists,
	withAdmin,
} from './reset'
import { validateDataset } from './validate'

export type PreflightStep =
	| 'environment'
	| 'postgres'
	| 'template'
	| 'restore'
	| 'migrations'
	| 'dataset'
	| 'invariants'

/** A failed prerequisite: the Run is recorded as INCOMPLETE and no measurement is presented. */
export class PreflightError extends Error {
	constructor(
		readonly step: PreflightStep,
		message: string,
	) {
		super(`Preflight failed at "${step}": ${message}`)
	}
}

export interface PreparedDataset {
	fingerprint: string
	description: string
	environment: Record<string, string>
}

const SETTINGS = [
	'shared_buffers',
	'work_mem',
	'effective_cache_size',
	'max_wal_size',
	'random_page_cost',
	'synchronous_commit',
	'max_connections',
]

export function loadBenchDatabase(env: Record<string, string | undefined>): BenchDatabase {
	try {
		return assertBenchDatabaseUrl(env.BENCH_DATABASE_URL, {
			templateName: env.BENCH_TEMPLATE_DATABASE,
			forbiddenUrls: [env.DATABASE_URL],
		})
	} catch (error) {
		throw new PreflightError('environment', (error as Error).message)
	}
}

async function postgresFacts(url: string): Promise<Record<string, string>> {
	const pool = new Pool({ connectionString: url, max: 1 })
	try {
		const { rows } = await pool.query<{ name: string; setting: string }>(
			'SELECT name, setting FROM pg_settings WHERE name = ANY($1) OR name = $2',
			[SETTINGS, 'server_version'],
		)
		const facts: Record<string, string> = {}
		for (const row of rows) {
			facts[row.name === 'server_version' ? 'postgres' : row.name] = row.setting
		}
		return facts
	} finally {
		await pool.end()
	}
}

/**
 * The prerequisites that can be checked without changing anything: PostgreSQL is reachable and
 * the pristine template exists. The command runs them before it opens a Run, so a machine that is
 * not set up never produces a published Run.
 */
export async function checkPrerequisites(database: BenchDatabase): Promise<void> {
	const target = new URL(database.url)

	try {
		await withAdmin(database.url, (admin) => admin.query('SELECT 1'))
	} catch (error) {
		throw new PreflightError(
			'postgres',
			`PostgreSQL is not reachable at ${target.hostname}:${target.port || 5432} (${(error as Error).message}). Start it with "pnpm bench:up".`,
		)
	}

	if (!(await templateExists(database))) {
		throw new PreflightError(
			'template',
			`template database "${database.templateName}" does not exist. Seed the benchmark database ("pnpm bench:migrate && pnpm bench:seed") and run "pnpm bench:template", or set BENCH_TEMPLATE_DATABASE to an existing template.`,
		)
	}
}

/**
 * Everything that must hold before a single measurement: the prerequisites, then the database
 * restored from the template and migrated to the source revision, and the restored data valid.
 * Any failure names its step and how to fix it.
 */
export async function prepareBenchmarkDatabase(database: BenchDatabase): Promise<PreparedDataset> {
	await checkPrerequisites(database)

	try {
		await restoreBenchmarkDatabase(database, {
			migrate: (url) => {
				try {
					migrateDatabase(url)
				} catch (error) {
					throw new PreflightError('migrations', (error as Error).message)
				}
			},
		})
	} catch (error) {
		throw error instanceof PreflightError
			? error
			: new PreflightError('restore', (error as Error).message)
	}

	const { stats, problems, invariantViolations } = await validateDataset(database.url)
	if (invariantViolations.length > 0) {
		throw new PreflightError('invariants', invariantViolations.join('; '))
	}
	if (problems.length > 0) {
		throw new PreflightError('dataset', problems.join('; '))
	}

	const recorded = await readTemplateDigest(database)
	if (recorded && recorded !== stats.digest) {
		throw new PreflightError(
			'dataset',
			`the restored data digest ${stats.digest} differs from the digest ${recorded} recorded on template "${database.templateName}" (template drift); rebuild it with "pnpm bench:template"`,
		)
	}

	return {
		fingerprint: stats.digest,
		description: `${stats.payments} payments, ${stats.wallets} wallets, ${stats.merchants} merchants`,
		environment: await postgresFacts(database.url),
	}
}
