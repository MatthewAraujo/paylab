import 'dotenv/config'
import { execFileSync, spawn } from 'node:child_process'
import { Client } from 'pg'
import { DemoAlreadySeededError, applyDemoSeed, findInvariantViolations } from './demo/apply'
import { assertDemoDatabaseUrl } from './demo/guard'
import { planDemoData } from './demo/plan'

const USAGE = `Usage: pnpm demo:<command>

  demo:seed          create the demo database if needed, migrate it and fill it with demo data
  demo:dev           run the API against the demo database
  demo:reset -- --yes  drop the demo database (the only destructive command)

Environment: DEMO_DATABASE_URL (required; local host, database name containing "demo").
Nothing here touches DATABASE_URL: development, test and benchmark data are never used.`

/** The same server, but the maintenance database, where CREATE and DROP DATABASE run. */
function adminUrl(url: string) {
	const admin = new URL(url)
	admin.pathname = '/postgres'
	return admin.toString()
}

async function withAdmin<T>(url: string, action: (client: Client) => Promise<T>) {
	const client = new Client({ connectionString: adminUrl(url) })
	await client.connect()
	try {
		return await action(client)
	} finally {
		await client.end()
	}
}

async function seed(url: string, name: string) {
	await withAdmin(url, async (admin) => {
		const found = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [name])
		if (!found.rowCount) {
			// The name passed the guard: a plain identifier, so quoting it is safe.
			await admin.query(`CREATE DATABASE "${name}"`)
			console.log(`Created database "${name}".`)
		}
	})

	execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'inherit',
	})

	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		const result = await applyDemoSeed(client, planDemoData({ now: new Date() }))
		const violations = await findInvariantViolations(client)
		if (violations.length > 0) {
			throw new Error(`Ledger invariants violated after seeding:\n- ${violations.join('\n- ')}`)
		}

		console.log(
			`\nSeeded ${result.payments} Payments and ${result.ledgerEntries} Ledger Entries. Ledger invariants hold.`,
		)
		console.log('\nAPI keys (shown once, store them now):')
		for (const merchant of result.merchants) {
			console.log(`  ${merchant.name} (${merchant.wallets} Wallets): ${merchant.apiKey}`)
		}
		console.log(`
Next:
  1. pnpm demo:dev                          (API on the demo database, http://localhost:3333)
  2. In paylab-ui/.env.local set PAYLAB_API_KEY to the "Demo Store" key, then pnpm dev
     (use the "Demo Rival" key to see that another Merchant's data is not visible)`)
	} finally {
		await client.end()
	}
}

async function reset(url: string, name: string, args: string[]) {
	if (!args.includes('--yes')) {
		throw new Error(
			`This drops database "${name}" and all its data. Re-run with: pnpm demo:reset -- --yes`,
		)
	}
	await withAdmin(url, async (admin) => {
		await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
	})
	console.log(`Dropped database "${name}" (if it existed).`)
}

function dev(url: string) {
	console.log('Starting the API on the demo database...')
	const child = spawn('pnpm', ['dev'], {
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'inherit',
	})
	child.on('exit', (code) => {
		process.exitCode = code ?? 0
	})
}

async function main() {
	const [command, ...args] = process.argv.slice(2).filter((arg) => arg !== '--')
	if (!command || command === '--help') {
		console.log(USAGE)
		return
	}

	const { url, name } = assertDemoDatabaseUrl(process.env.DEMO_DATABASE_URL)

	if (command === 'seed') {
		await seed(url, name)
	} else if (command === 'reset') {
		await reset(url, name, args)
	} else if (command === 'dev') {
		dev(url)
	} else {
		throw new Error(`Unknown command "${command}"\n\n${USAGE}`)
	}
}

main().catch((error) => {
	console.error(error instanceof DemoAlreadySeededError ? error.message : error)
	process.exitCode = 1
})
