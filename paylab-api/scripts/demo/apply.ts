import { generateApiKey, hashApiKey } from '@/domain/paylab/application/services/api-key'
import { requestFingerprint } from '@/domain/paylab/application/services/request-fingerprint'
import type { Client } from 'pg'
import type { DemoPlan } from './plan'

export class DemoAlreadySeededError extends Error {
	constructor() {
		super(
			'The demo data already exists. API keys are stored only as hashes and cannot be shown again: run `pnpm demo:reset -- --yes` and seed again.',
		)
	}
}

export interface SeededMerchant {
	name: string
	id: string
	/** The raw key exists only in this result; only its hash is stored. */
	apiKey: string
	wallets: number
}

export interface DemoSeedResult {
	merchants: SeededMerchant[]
	payments: number
	ledgerEntries: number
}

type Row = { id: string }

/**
 * Writes the plan in ONE transaction, insert-only. The deferred ledger triggers validate each
 * Ledger Transaction at commit, so a plan that broke the books would be rejected as a whole and
 * leave nothing behind. Timestamps are explicit because the write path always uses now().
 */
export async function applyDemoSeed(client: Client, plan: DemoPlan): Promise<DemoSeedResult> {
	const names = plan.merchants.map((merchant) => merchant.name)
	const existing = await client.query('SELECT 1 FROM merchants WHERE name = ANY($1)', [names])

	if (existing.rowCount) {
		throw new DemoAlreadySeededError()
	}

	await client.query('BEGIN')
	try {
		const result = await write(client, plan)
		await client.query('COMMIT')
		return result
	} catch (error) {
		await client.query('ROLLBACK')
		throw error
	}
}

async function write(client: Client, plan: DemoPlan): Promise<DemoSeedResult> {
	const first = plan.wallets[0].createdAt
	const clearing = (
		await client.query<Row>(
			"SELECT id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'",
		)
	).rows[0]?.id
	if (!clearing) {
		throw new Error('The External Clearing Account is missing: apply the migrations first')
	}

	const merchantIds = new Map<string, string>()
	const merchants: SeededMerchant[] = []
	for (const merchant of plan.merchants) {
		const { rows } = await client.query<Row>(
			'INSERT INTO merchants (name, created_at) VALUES ($1, $2) RETURNING id',
			[merchant.name, first],
		)
		const apiKey = generateApiKey()
		await client.query(
			'INSERT INTO merchant_api_keys (merchant_id, key_hash, created_at) VALUES ($1::uuid, $2, $3)',
			[rows[0].id, hashApiKey(apiKey), first],
		)
		merchantIds.set(merchant.key, rows[0].id)
		merchants.push({ name: merchant.name, id: rows[0].id, apiKey, wallets: 0 })
	}

	const walletIds = new Map<string, { id: string; merchantId: string }>()
	for (const wallet of plan.wallets) {
		const merchantId = merchantIds.get(wallet.merchant) as string
		const { rows } = await client.query<Row>(
			`INSERT INTO accounts (kind, merchant_id, currency, created_at)
			 VALUES ('WALLET', $1::uuid, 'BRL', $2) RETURNING id`,
			[merchantId, wallet.createdAt],
		)
		walletIds.set(wallet.key, { id: rows[0].id, merchantId })
		const owner = merchants.find((merchant) => merchant.id === merchantId)
		if (owner) {
			owner.wallets++
		}
	}

	const lookup = (key: string) => {
		const wallet = walletIds.get(key)
		if (!wallet) {
			throw new Error(`Plan references an unknown Wallet "${key}"`)
		}
		return wallet
	}

	let ledgerEntries = 0
	let sequence = 0

	// One balanced Ledger Transaction: a debit on `from`, a credit on `to`, the same instant.
	async function settle(from: string, to: string, amount: number, at: Date) {
		const { rows } = await client.query<Row>(
			'INSERT INTO ledger_transactions (created_at) VALUES ($1) RETURNING id',
			[at],
		)
		await client.query(
			`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount, created_at)
			 VALUES ($1::uuid, $2::uuid, 'DEBIT'::entry_direction, $4, $5),
			        ($1::uuid, $3::uuid, 'CREDIT'::entry_direction, $4, $5)`,
			[rows[0].id, from, to, amount, at],
		)
		ledgerEntries += 2
		return rows[0].id
	}

	async function payment(input: {
		merchantId: string
		source: string
		destination: string
		amount: number
		status: 'SUCCEEDED' | 'FAILED'
		ledgerTransactionId: string | null
		at: Date
		prefix: string
	}) {
		sequence++
		await client.query(
			`INSERT INTO payments (merchant_id, source_account_id, destination_account_id, amount, currency,
			                       status, failure_reason, idempotency_key, request_fingerprint,
			                       ledger_transaction_id, created_at, updated_at)
			 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'BRL', $5::payment_status, $6, $7, $8, $9::uuid, $10, $10)`,
			[
				input.merchantId,
				input.source,
				input.destination,
				input.amount,
				input.status,
				input.status === 'FAILED' ? 'INSUFFICIENT_FUNDS' : null,
				`demo-${input.prefix}-${sequence}`,
				requestFingerprint({
					sourceAccountId: input.source,
					destinationAccountId: input.destination,
					amount: input.amount,
					currency: 'BRL',
				}),
				input.ledgerTransactionId,
				input.at,
			],
		)
	}

	for (const event of plan.events) {
		if (event.kind === 'FUNDING') {
			// The internal funding path: clearing debit, Wallet credit, a SUCCEEDED Payment.
			const wallet = lookup(event.wallet)
			const ledgerTransactionId = await settle(clearing, wallet.id, event.amount, event.at)
			await payment({
				merchantId: wallet.merchantId,
				source: clearing,
				destination: wallet.id,
				amount: event.amount,
				status: 'SUCCEEDED',
				ledgerTransactionId,
				at: event.at,
				prefix: 'fund',
			})
			continue
		}

		const source = lookup(event.source)
		const destination = lookup(event.destination)
		const ledgerTransactionId =
			event.status === 'SUCCEEDED'
				? await settle(source.id, destination.id, event.amount, event.at)
				: null
		await payment({
			merchantId: source.merchantId,
			source: source.id,
			destination: destination.id,
			amount: event.amount,
			status: event.status,
			ledgerTransactionId,
			at: event.at,
			prefix: 'pay',
		})
	}

	return { merchants, payments: sequence, ledgerEntries }
}

/**
 * The same two global invariants the test suites check after every database test: all ledger
 * entries sum to zero, and no Wallet has a negative Balance.
 */
export async function findInvariantViolations(client: Client): Promise<string[]> {
	const violations: string[] = []

	const net = await client.query<{ net: string }>(
		`SELECT coalesce(sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)::text AS net
		 FROM ledger_entries`,
	)
	if (net.rows[0].net !== '0') {
		violations.push(`sum of all ledger entries is ${net.rows[0].net}, expected 0`)
	}

	const negative = await client.query<{ id: string; balance: string }>(
		`SELECT a.id, sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END)::text AS balance
		 FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
		 WHERE a.kind = 'WALLET'
		 GROUP BY a.id
		 HAVING sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END) < 0`,
	)
	for (const row of negative.rows) {
		violations.push(`Wallet ${row.id} has a negative Balance of ${row.balance}`)
	}

	return violations
}
