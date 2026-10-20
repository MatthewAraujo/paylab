import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { hashApiKey } from '@/domain/paylab/application/services/api-key'
import { Client } from 'pg'
import { applyDemoSeed, findInvariantViolations } from './demo/apply'
import { planDemoData } from './demo/plan'

// This initializer belongs exclusively to the root Compose stack. The host demo
// commands retain their localhost-only guard, including for destructive resets.
async function main() {
	const url = process.env.DATABASE_URL
	if (!url) throw new Error('DATABASE_URL is required')
	const parsed = new URL(url)
	if (parsed.hostname !== 'postgres' || parsed.pathname !== '/paylab_demo') {
		throw new Error('Docker demo initialization requires postgres/paylab_demo')
	}

	const keyFile = '/run/paylab/api-key'
	const client = new Client({ connectionString: url })
	await client.connect()
	try {
		// Serialize initializers even if another Compose invocation is running.
		await client.query('SELECT pg_advisory_lock(742019)')
		const existing = await client.query('SELECT 1 FROM merchants LIMIT 1')
		if (existing.rowCount) {
			if (!existsSync(keyFile)) {
				throw new Error(
					'Demo data exists but its credential volume is missing. Restore the matching credential volume; no data was changed.',
				)
			}
			const key = readFileSync(keyFile, 'utf8').trim()
			const valid = await client.query(
				`SELECT 1 FROM merchant_api_keys k JOIN merchants m ON m.id = k.merchant_id
				 WHERE m.name = 'Demo Store' AND k.key_hash = $1 AND k.revoked_at IS NULL`,
				[hashApiKey(key)],
			)
			if (!valid.rowCount) throw new Error('The saved demo credential does not match the database')
			console.log('Existing demo data and credential preserved.')
			return
		}
		if (existsSync(keyFile)) {
			throw new Error(
				'A demo credential exists but the database is empty. Restore the matching database volume; no data was changed.',
			)
		}

		const result = await applyDemoSeed(client, planDemoData({ now: new Date() }))
		const violations = await findInvariantViolations(client)
		if (violations.length)
			throw new Error(`Demo ledger invariants failed: ${violations.join('; ')}`)
		const store = result.merchants.find((merchant) => merchant.name === 'Demo Store')
		if (!store) throw new Error('Demo Store was not created')
		writeFileSync(`${keyFile}.tmp`, store.apiKey, { mode: 0o600 })
		renameSync(`${keyFile}.tmp`, keyFile)
		console.log(`Demo ready: ${result.payments} Payments; credential shared privately with the UI.`)
	} finally {
		await client.end()
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : 'Docker demo initialization failed')
	process.exitCode = 1
})
