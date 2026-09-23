import type { Pool } from 'pg'

export type PaymentStatus = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

export type DatasetStats = {
	merchants: number
	wallets: number
	payments: number
	paymentsByStatus: Record<PaymentStatus, number>
	ledgerTransactions: number
	entries: number
	walletEntries: number
	settledWithoutLedgerTransaction: number
	unsettledWithLedgerTransaction: number
	/** Share of Wallet entries held by the top 1% of Wallets (by entry count). */
	topOnePercentEntryShare: number
	/** Wallets whose running Balance ever dropped below zero, in chronological order. */
	walletsEverNegative: number
	paymentVolume: string
	debitVolume: string
	creditVolume: string
	/** md5 over per-Account entry aggregates and per-status Payment aggregates. */
	digest: string
	leftoverHelperObjects: string[]
	disabledTriggers: string[]
	analyzed: boolean
}

async function scalar<T>(pool: Pool, query: string): Promise<T> {
	const { rows } = await pool.query(query)
	return Object.values(rows[0])[0] as T
}

// Read-only aggregate view of a generated dataset. Used by the validation spec and by
// `pnpm bench:validate`; two runs of the same seed must return equal values.
export async function collectDatasetStats(pool: Pool): Promise<DatasetStats> {
	const count = async (query: string) => Number(await scalar<string>(pool, query))

	const byStatus = await pool.query<{ status: PaymentStatus; count: string }>(
		'SELECT status, count(*) AS count FROM payments GROUP BY status',
	)
	const paymentsByStatus: Record<PaymentStatus, number> = {
		CREATED: 0,
		PROCESSING: 0,
		SUCCEEDED: 0,
		FAILED: 0,
	}
	for (const row of byStatus.rows) {
		paymentsByStatus[row.status] = Number(row.count)
	}

	const volumes = await pool.query<{ payment: string; debit: string; credit: string }>(`
		SELECT (SELECT coalesce(sum(amount), 0) FROM payments)::text AS payment,
		       (SELECT coalesce(sum(amount), 0) FROM ledger_entries WHERE direction = 'DEBIT')::text AS debit,
		       (SELECT coalesce(sum(amount), 0) FROM ledger_entries WHERE direction = 'CREDIT')::text AS credit`)

	const topShare = await scalar<number | null>(
		pool,
		`WITH per_wallet AS (
		   SELECT a.id, count(*) AS entries
		   FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
		   WHERE a.kind = 'WALLET' GROUP BY a.id
		 ), ranked AS (
		   SELECT entries, row_number() OVER (ORDER BY entries DESC, id) AS rank FROM per_wallet
		 )
		 SELECT sum(entries) FILTER (
		          WHERE rank <= ceil((SELECT count(*) FROM accounts WHERE kind = 'WALLET') * 0.01)
		        )::float8 / nullif(sum(entries), 0)
		 FROM ranked`,
	)

	const digest = await scalar<string>(
		pool,
		`SELECT md5(
		   coalesce((SELECT string_agg(account_id || ':' || n || ':' || total, ',' ORDER BY account_id)
		             FROM (SELECT account_id, count(*) AS n,
		                          sum(CASE direction WHEN 'DEBIT' THEN -amount ELSE amount END) AS total
		                   FROM ledger_entries GROUP BY account_id) s), '')
		   || '|' ||
		   coalesce((SELECT string_agg(status || ':' || n || ':' || total, ',' ORDER BY status)
		             FROM (SELECT status, count(*) AS n, sum(amount) AS total
		                   FROM payments GROUP BY status) s), '')
		 )`,
	)

	const helpers = await pool.query<{ name: string }>(`
		SELECT relname AS name FROM pg_class
		WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'bench\\_%'`)
	const triggers = await pool.query<{ name: string }>(
		`SELECT tgname AS name FROM pg_trigger WHERE NOT tgisinternal AND tgenabled <> 'O'`,
	)

	return {
		merchants: await count('SELECT count(*) FROM merchants'),
		wallets: await count(`SELECT count(*) FROM accounts WHERE kind = 'WALLET'`),
		payments: await count('SELECT count(*) FROM payments'),
		paymentsByStatus,
		ledgerTransactions: await count('SELECT count(*) FROM ledger_transactions'),
		entries: await count('SELECT count(*) FROM ledger_entries'),
		walletEntries: await count(
			`SELECT count(*) FROM ledger_entries e JOIN accounts a ON a.id = e.account_id WHERE a.kind = 'WALLET'`,
		),
		settledWithoutLedgerTransaction: await count(
			`SELECT count(*) FROM payments WHERE status = 'SUCCEEDED' AND ledger_transaction_id IS NULL`,
		),
		unsettledWithLedgerTransaction: await count(
			`SELECT count(*) FROM payments WHERE status <> 'SUCCEEDED' AND ledger_transaction_id IS NOT NULL`,
		),
		topOnePercentEntryShare: Number(topShare ?? 0),
		walletsEverNegative: await count(
			`SELECT count(DISTINCT account_id) FROM (
			   SELECT e.account_id,
			          sum(CASE e.direction WHEN 'CREDIT' THEN e.amount ELSE -e.amount END)
			            OVER (PARTITION BY e.account_id ORDER BY e.created_at, e.id) AS running
			   FROM ledger_entries e JOIN accounts a ON a.id = e.account_id
			   WHERE a.kind = 'WALLET'
			 ) s WHERE running < 0`,
		),
		paymentVolume: volumes.rows[0].payment,
		debitVolume: volumes.rows[0].debit,
		creditVolume: volumes.rows[0].credit,
		digest,
		leftoverHelperObjects: helpers.rows.map((row) => row.name),
		disabledTriggers: triggers.rows.map((row) => row.name),
		analyzed: await scalar<boolean>(
			pool,
			`SELECT bool_and(reltuples > 0) FROM pg_class WHERE relname IN ('payments', 'ledger_entries', 'ledger_transactions')`,
		),
	}
}
