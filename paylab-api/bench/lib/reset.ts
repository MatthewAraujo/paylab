import { execFileSync } from 'node:child_process'
import { Client, Pool } from 'pg'
import type { BenchDatabase } from './database'
import { collectDatasetStats } from './stats'

const TEMPLATE_COMMENT = 'paylab-bench-template '

/** The same server, on the maintenance database, where CREATE and DROP DATABASE run. */
function adminUrl(url: string) {
	const admin = new URL(url)
	admin.pathname = '/postgres'
	return admin.toString()
}

export async function withAdmin<T>(
	url: string,
	action: (client: Client) => Promise<T>,
): Promise<T> {
	const client = new Client({ connectionString: adminUrl(url) })
	await client.connect()
	try {
		return await action(client)
	} finally {
		await client.end()
	}
}

// The names below passed the guard: plain identifiers, so quoting them is safe.
async function disconnect(admin: Client, name: string) {
	await admin.query(
		'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()',
		[name],
	)
}

async function datasetDigest(url: string): Promise<string> {
	const pool = new Pool({ connectionString: url, max: 1 })
	try {
		return (await collectDatasetStats(pool)).digest
	} finally {
		await pool.end()
	}
}

/**
 * Freezes the current contents of the benchmark database as the pristine copy every Run is
 * restored from, and records its dataset digest on the template so drift can be detected.
 */
export async function snapshotTemplate(database: BenchDatabase): Promise<{ digest: string }> {
	const digest = await datasetDigest(database.url)
	await withAdmin(database.url, async (admin) => {
		await disconnect(admin, database.name)
		await disconnect(admin, database.templateName)
		await admin.query(`DROP DATABASE IF EXISTS "${database.templateName}"`)
		await admin.query(`CREATE DATABASE "${database.templateName}" TEMPLATE "${database.name}"`)
		const comment = `${TEMPLATE_COMMENT}${JSON.stringify({ digest })}`.replace(/'/g, "''")
		await admin.query(`COMMENT ON DATABASE "${database.templateName}" IS '${comment}'`)
	})
	return { digest }
}

export async function templateExists(database: BenchDatabase): Promise<boolean> {
	return withAdmin(database.url, async (admin) => {
		const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [
			database.templateName,
		])
		return (found.rowCount ?? 0) > 0
	})
}

/** The digest recorded by `snapshotTemplate`, or null for a template made by hand. */
export async function readTemplateDigest(database: BenchDatabase): Promise<string | null> {
	return withAdmin(database.url, async (admin) => {
		const { rows } = await admin.query<{ comment: string | null }>(
			`SELECT shobj_description(oid, 'pg_database') AS comment FROM pg_database WHERE datname = $1`,
			[database.templateName],
		)
		const comment = rows[0]?.comment
		if (!comment?.startsWith(TEMPLATE_COMMENT)) {
			return null
		}
		return JSON.parse(comment.slice(TEMPLATE_COMMENT.length)).digest ?? null
	})
}

export function migrateDatabase(url: string) {
	try {
		execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
			env: { ...process.env, DATABASE_URL: url },
			stdio: 'pipe',
			encoding: 'utf8',
		})
	} catch (error) {
		const output = error as { stdout?: string; stderr?: string }
		throw new Error(`prisma migrate deploy failed:\n${output.stderr || output.stdout || error}`)
	}
}

/**
 * Puts the benchmark database back in a known state: a fresh copy of the template, brought up
 * to the schema of the source revision under test (migrations), then vacuumed and analyzed so
 * every Run starts with the same statistics. Anything connected to the database is dropped.
 */
export async function restoreBenchmarkDatabase(
	database: BenchDatabase,
	options: { migrate?: (url: string) => void } = {},
): Promise<void> {
	await withAdmin(database.url, async (admin) => {
		await disconnect(admin, database.name)
		await admin.query(`DROP DATABASE IF EXISTS "${database.name}"`)
		try {
			await admin.query(`CREATE DATABASE "${database.name}" TEMPLATE "${database.templateName}"`)
		} catch (error) {
			throw new Error(
				`Could not copy template "${database.templateName}" (is something connected to it?): ${(error as Error).message}`,
			)
		}
	})
	;(options.migrate ?? migrateDatabase)(database.url)

	const pool = new Pool({ connectionString: database.url, max: 1 })
	try {
		await pool.query('VACUUM (ANALYZE)')
	} finally {
		await pool.end()
	}
}
