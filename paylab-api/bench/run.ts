import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { cpus, totalmem } from 'node:os'
import { Pool } from 'pg'
import { assertBenchDatabaseUrl } from './lib/database'
import { snapshotTemplate } from './lib/reset'
import { FULL_SIZE, type SeedOptions, seedBenchmark } from './lib/seed'
import { validateDataset } from './lib/validate'

const USAGE = `Usage: pnpm bench:<command> [-- options]

Commands
  bench:migrate   apply the Prisma migrations to the benchmark database
  bench:seed      replace the benchmark database contents with the generated dataset
  bench:template  snapshot the validated database as the pristine copy benchmark:run restores from
  bench:validate  print the dataset statistics and run the global invariant check
  bench:targets   print a hot and a cold Wallet and Merchant to use as query parameters
  bench:explain   EXPLAIN (ANALYZE, BUFFERS) a parameterized SQL file: <file.sql> [param ...]

Seed options: --small (10k Payments, 200 Wallets, 10 Merchants), --seed <text>,
  --payments <n>, --wallets <n>, --merchants <n>, --batch <n>

Environment: BENCH_DATABASE_URL (required; the database name must contain "bench").
  BENCH_TEMPLATE_DATABASE (optional; default <database>_template, or an existing template).`

function benchUrl(): string {
	const url = process.env.BENCH_DATABASE_URL
	if (!url) {
		throw new Error('BENCH_DATABASE_URL is not set (see .env.example)')
	}
	// The generator empties the database it connects to. Refuse anything that is not
	// visibly a benchmark database, so a wrong variable can never wipe development data.
	const name = new URL(url).pathname.replace(/^\//, '')
	if (!name.includes('bench')) {
		throw new Error(`Refusing to use database "${name}": its name must contain "bench"`)
	}
	return url
}

function parseSeedOptions(args: string[]): SeedOptions {
	const options = { ...FULL_SIZE }
	for (let i = 0; i < args.length; i++) {
		const flag = args[i]
		if (flag === '--small') {
			Object.assign(options, { payments: 10_000, wallets: 200, merchants: 10, batchSize: 2_500 })
			continue
		}
		const value = args[++i]
		if (value === undefined) {
			throw new Error(`Missing value for ${flag}`)
		}
		if (flag === '--seed') options.seed = value
		else if (flag === '--payments') options.payments = Number(value)
		else if (flag === '--wallets') options.wallets = Number(value)
		else if (flag === '--merchants') options.merchants = Number(value)
		else if (flag === '--batch') options.batchSize = Number(value)
		else throw new Error(`Unknown option ${flag}`)
	}
	return options
}

async function environmentReport(pool: Pool): Promise<string> {
	const { rows } = await pool.query<{ version: string }>('SELECT version() AS version')
	const settings = await pool.query<{ name: string; setting: string }>(
		`SELECT name, setting FROM pg_settings
		 WHERE name IN ('shared_buffers', 'work_mem', 'effective_cache_size', 'max_wal_size',
		                'random_page_cost', 'synchronous_commit', 'max_connections')`,
	)
	return [
		`machine: ${cpus()[0]?.model.trim()} x ${cpus().length} logical CPUs, ${(totalmem() / 2 ** 30).toFixed(1)} GiB RAM`,
		`node: ${process.version}`,
		`postgres: ${rows[0].version}`,
		`settings: ${settings.rows.map((row) => `${row.name}=${row.setting}`).join(', ')}`,
	].join('\n')
}

async function seed(pool: Pool, args: string[]) {
	const options = parseSeedOptions(args)
	console.log(await environmentReport(pool))
	console.log(`seeding: ${JSON.stringify(options)}`)
	const { totalMs, steps } = await seedBenchmark(pool, options)
	console.log(`timings (ms): ${JSON.stringify(steps)}`)
	console.log(`total: ${(totalMs / 1000).toFixed(1)} s`)
	await validate()
}

async function validate() {
	const { stats, problems, invariantViolations } = await validateDataset(benchUrl())
	console.log(JSON.stringify(stats, null, 2))

	const all = [...invariantViolations, ...problems]
	if (all.length > 0) {
		throw new Error(`Dataset validation failed:\n- ${all.join('\n- ')}`)
	}
	console.log(
		'validation: OK (invariants clean, 2 entries per settled Payment, no Wallet ever negative)',
	)
}

// Freezes the validated benchmark database as the template every `pnpm benchmark:run` restores from.
async function template() {
	const database = assertBenchDatabaseUrl(process.env.BENCH_DATABASE_URL, {
		templateName: process.env.BENCH_TEMPLATE_DATABASE,
		forbiddenUrls: [process.env.DATABASE_URL],
	})
	const { problems, invariantViolations } = await validateDataset(database.url)
	const all = [...invariantViolations, ...problems]
	if (all.length > 0) {
		throw new Error(`Refusing to snapshot an invalid dataset:\n- ${all.join('\n- ')}`)
	}
	const { digest } = await snapshotTemplate(database)
	console.log(
		`template "${database.templateName}" created from "${database.name}" (digest ${digest})`,
	)
}

async function targets(pool: Pool) {
	const wallet = async (label: string, order: string) => {
		const { rows } = await pool.query(
			`SELECT a.id AS "walletId", a.merchant_id AS "merchantId", count(*) AS entries
			 FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
			 WHERE a.kind = 'WALLET' GROUP BY a.id, a.merchant_id
			 ORDER BY entries ${order}, a.id LIMIT 1 OFFSET ${label === 'median' ? '(SELECT count(DISTINCT account_id) / 2 FROM ledger_entries)' : 0}`,
		)
		console.log(label, JSON.stringify(rows[0]))
	}
	await wallet('hot', 'DESC')
	await wallet('median', 'DESC')
	await wallet('cold', 'ASC')
	const { rows } = await pool.query(
		`SELECT merchant_id AS "merchantId", count(*) AS payments FROM payments
		 GROUP BY merchant_id ORDER BY payments DESC, merchant_id`,
	)
	console.log('hot merchant', JSON.stringify(rows[0]))
	console.log('cold merchant', JSON.stringify(rows[rows.length - 1]))
	const { rows: range } = await pool.query(
		'SELECT min(created_at) AS "from", max(created_at) AS "to" FROM payments',
	)
	console.log('payments time range', JSON.stringify(range[0]))
}

// Plan capture: PREPARE the file's SQL ($1, $2 ... placeholders) and run it under
// EXPLAIN (ANALYZE, BUFFERS) with the given values. Always a custom plan, so the
// planner sees the actual values, as it would for a one-off query.
async function explain(pool: Pool, args: string[]) {
	const [file, ...params] = args
	if (!file) {
		throw new Error('Usage: pnpm bench:explain -- <file.sql> [param ...]')
	}
	const text = readFileSync(file, 'utf8').trim().replace(/;$/, '')
	const client = await pool.connect()
	try {
		await client.query('SET plan_cache_mode = force_custom_plan')
		await client.query(`PREPARE bench_query AS ${text}`)
		const literals = params.map((value) => `'${value.replace(/'/g, "''")}'`).join(', ')
		const call = params.length > 0 ? `EXECUTE bench_query(${literals})` : 'EXECUTE bench_query'
		const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS, SETTINGS) ${call}`)
		console.log(rows.map((row) => row['QUERY PLAN']).join('\n'))
	} finally {
		client.release()
	}
}

function migrate() {
	execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: benchUrl() },
		stdio: 'inherit',
	})
}

async function main() {
	const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== '--')
	if (!command || command === '--help') {
		console.log(USAGE)
		return
	}
	if (command === 'migrate') {
		migrate()
		return
	}
	if (command === 'template') {
		await template()
		return
	}
	const pool = new Pool({ connectionString: benchUrl(), max: 2 })
	try {
		if (command === 'seed') await seed(pool, args)
		else if (command === 'validate') await validate()
		else if (command === 'targets') await targets(pool)
		else if (command === 'explain') await explain(pool, args)
		else throw new Error(`Unknown command ${command}\n${USAGE}`)
	} finally {
		await pool.end()
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : error)
	process.exit(1)
})
