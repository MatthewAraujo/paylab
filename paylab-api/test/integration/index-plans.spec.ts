import {
	DAILY_REPORT_SQL,
	HISTORY_FIRST_PAGE_SQL,
	HISTORY_NEXT_PAGE_SQL,
	buildPaymentListQuery,
} from '@/infra/database/read-queries-sql'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedBenchmark } from '../../bench/lib/seed'

// T13 plan regression (ADR 0005): the documented queries must use the indexes the
// experiments adopted. The fixture is the T12 generator at reduced size (40 thousand
// Payments and 76 thousand entries, vacuumed and analyzed), large enough for the planner
// to prefer the indexes over a sequential scan, small enough for the integration suite.
//
// The Balance text is the one in prisma-accounts-repository.ts and prisma-settlement.ts
// (also in docs/reads-sql.md); the trigger lookup is the one in
// ledger_assert_transaction_balanced (migration 20260923151000).
const BALANCE_SQL = `SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
FROM ledger_entries
WHERE account_id = $1::uuid`
const TRIGGER_LOOKUP_SQL = `SELECT count(*), coalesce(sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)
FROM ledger_entries
WHERE ledger_transaction_id = $1::uuid`

type PlanNode = { 'Node Type': string; 'Index Name'?: string; Plans?: PlanNode[] }

function walk(node: PlanNode, visit: (n: PlanNode) => void) {
	visit(node)
	for (const child of node.Plans ?? []) walk(child, visit)
}

describe('Index plans on the benchmark-shaped fixture (integration)', () => {
	let pool: Pool
	let walletId: string
	let merchantId: string
	let transactionId: string

	async function plan(text: string, params: unknown[]) {
		// A custom plan built from the real values, as the application's first executions get.
		const client = await pool.connect()
		try {
			await client.query('SET plan_cache_mode = force_custom_plan')
			const { rows } = await client.query(`EXPLAIN (FORMAT JSON) ${text}`, params)
			const nodes: PlanNode[] = []
			walk(rows[0]['QUERY PLAN'][0].Plan, (n) => nodes.push(n))
			return {
				indexes: nodes.map((n) => n['Index Name']).filter((n): n is string => Boolean(n)),
				types: nodes.map((n) => n['Node Type']),
			}
		} finally {
			client.release()
		}
	}

	beforeAll(async () => {
		pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 })
		await seedBenchmark(pool, {
			seed: 'index-plans',
			payments: 40_000,
			wallets: 1_000,
			merchants: 50,
			batchSize: 10_000,
		})
		const wallet = await pool.query(
			'SELECT account_id FROM ledger_entries GROUP BY account_id ORDER BY count(*) DESC LIMIT 1 OFFSET 300',
		)
		walletId = wallet.rows[0].account_id
		const merchant = await pool.query('SELECT id FROM merchants ORDER BY id LIMIT 1')
		merchantId = merchant.rows[0].id
		const transaction = await pool.query('SELECT id FROM ledger_transactions LIMIT 1')
		transactionId = transaction.rows[0].id
	})

	afterAll(async () => {
		await pool.end()
	})

	it('serves the commit-time trigger lookup by ledger_transaction_id from an index', async () => {
		const { indexes } = await plan(TRIGGER_LOOKUP_SQL, [transactionId])
		expect(indexes).toContain('ledger_entries_ledger_transaction_id_idx')
	})

	it('serves history pages with no sort from the (account, created_at, id) index', async () => {
		const first = await plan(HISTORY_FIRST_PAGE_SQL, [walletId, 21])
		expect(first.indexes).toContain('ledger_entries_account_created_id_idx')
		expect(first.types).not.toContain('Sort')

		const next = await plan(HISTORY_NEXT_PAGE_SQL, [
			walletId,
			'2026-07-15T00:00:00.000Z',
			'ffffffff-ffff-ffff-ffff-ffffffffffff',
			21,
		])
		expect(next.indexes).toContain('ledger_entries_account_created_id_idx')
		expect(next.types).not.toContain('Sort')
	})

	it('answers the Balance from the covering index without touching the table', async () => {
		const { indexes, types } = await plan(BALANCE_SQL, [walletId])
		expect(indexes).toContain('ledger_entries_account_created_id_idx')
		expect(types).toContain('Index Only Scan')
	})

	it('serves the Payment list and the report from the (merchant, created_at, id) index', async () => {
		const list = buildPaymentListQuery({ merchantId, fetch: 21 })
		expect((await plan(list.text, list.params)).indexes).toContain(
			'payments_merchant_created_id_idx',
		)

		const report = await plan(DAILY_REPORT_SQL, [
			merchantId,
			'2026-06-01T00:00:00.000Z',
			'2026-06-30T00:00:00.000Z',
		])
		expect(report.indexes).toContain('payments_merchant_created_id_idx')
	})
})
