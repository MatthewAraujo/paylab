// EXPERIMENT ONLY (T14). Connection and fixture helpers for the strategy experiments.
import { Client } from 'pg'

/** Resolved when called, so a caller (or a test) can point it at another benchmark database. */
export const benchUrl = () =>
	process.env.BENCH_DATABASE_URL ?? 'postgresql://paylab:paylab@localhost:5433/paylab_bench'

export async function connect(options?: string, url: string = benchUrl()): Promise<Client> {
	const client = new Client({ connectionString: url, options })
	await client.connect()
	return client
}

export const HOT_WALLET = '51dcbf38-ab78-8b0b-acfb-954297fd8a16'

export type Wallet = { id: string; merchantId: string }

export async function clearingAccount(c: Client) {
	const { rows } = await c.query(
		"SELECT id FROM accounts WHERE kind = 'EXTERNAL_CLEARING' AND currency = 'BRL'",
	)
	return rows[0].id as string
}

/** Scratch-database schema additions (never shipped) and one-time warm-up. */
export async function prepareSchema(c: Client) {
	await c.query('ALTER TABLE accounts ADD COLUMN IF NOT EXISTS version bigint NOT NULL DEFAULT 0')
	await c.query('CREATE EXTENSION IF NOT EXISTS pg_prewarm').catch(() => undefined)
	for (const rel of [
		'ledger_entries',
		'payments',
		'ledger_transactions',
		'accounts',
		'ledger_entries_account_created_id_idx',
		'ledger_entries_ledger_transaction_id_idx',
		'payments_merchant_created_id_idx',
	]) {
		await c.query('SELECT pg_prewarm($1::regclass)', [rel]).catch(() => undefined)
	}
}

/** Credits `centavos` to each account from the clearing account as ONE balanced Ledger Transaction. */
export async function fund(c: Client, accountIds: string[], centavos: number) {
	const clearing = await clearingAccount(c)
	await c.query('BEGIN')
	const lt = await c.query('INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id')
	await c.query(
		`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
		 SELECT $1::uuid, a, 'CREDIT'::entry_direction, $3::bigint FROM unnest($2::uuid[]) AS a
		 UNION ALL SELECT $1::uuid, $4::uuid, 'DEBIT'::entry_direction, $3::bigint * $5::bigint`,
		[lt.rows[0].id, accountIds, centavos, clearing, accountIds.length],
	)
	await c.query('COMMIT')
}

export async function wallets(c: Client): Promise<Wallet[]> {
	const { rows } = await c.query(
		"SELECT id, merchant_id AS \"merchantId\" FROM accounts WHERE kind = 'WALLET' AND currency = 'BRL' ORDER BY id",
	)
	return rows
}

export async function walletById(c: Client, id: string): Promise<Wallet> {
	const { rows } = await c.query(
		'SELECT id, merchant_id AS "merchantId" FROM accounts WHERE id = $1::uuid',
		[id],
	)
	return rows[0]
}

/** Inserts `count` CREATED Payments in one statement; returns their ids. */
export async function createPayments(
	c: Client,
	merchantId: string,
	source: string,
	destination: string,
	amount: number,
	count: number,
): Promise<string[]> {
	const { rows } = await c.query(
		`INSERT INTO payments (id, merchant_id, source_account_id, destination_account_id, amount, currency, status, idempotency_key, request_fingerprint)
		 SELECT g, $1::uuid, $2::uuid, $3::uuid, $4::bigint, 'BRL', 'CREATED', g::text, 'fp' FROM (SELECT gen_random_uuid() AS g FROM generate_series(1, $5::int)) t
		 RETURNING id`,
		[merchantId, source, destination, amount, count],
	)
	return rows.map((r) => r.id)
}

export async function balanceOf(c: Client, accountId: string): Promise<bigint> {
	const { rows } = await c.query(
		`SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
		 FROM ledger_entries WHERE account_id = $1::uuid`,
		[accountId],
	)
	return BigInt(rows[0].balance)
}

/** The same two global invariants as test/support/invariants.ts, on this connection. */
export async function invariantViolations(c: Client): Promise<string[]> {
	const violations: string[] = []
	const net = await c.query(
		"SELECT coalesce(sum(CASE direction WHEN 'DEBIT' THEN amount ELSE -amount END), 0)::bigint AS net FROM ledger_entries",
	)
	if (BigInt(net.rows[0].net) !== 0n) {
		violations.push(`sum of all ledger entries is ${net.rows[0].net}, expected 0`)
	}
	const neg = await c.query(
		`SELECT a.id, sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END)::bigint AS balance
		 FROM accounts a JOIN ledger_entries e ON e.account_id = a.id WHERE a.kind = 'WALLET'
		 GROUP BY a.id HAVING sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END) < 0`,
	)
	for (const row of neg.rows) {
		violations.push(`Wallet ${row.id} has a negative Balance of ${row.balance}`)
	}
	return violations
}
