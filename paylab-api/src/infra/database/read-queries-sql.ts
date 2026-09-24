// The exact SQL of the Merchant-facing read queries (ADR 0004). This file is the
// single source: the application runs these strings, docs/reads-sql.md mirrors them
// (a test keeps the two in sync), and the benchmarks (T12 to T14) reuse them as is.
//
// Keyset order everywhere: created_at DESC, then id DESC, compared as a row value.
// Only the indexes the constraints already give exist; index design is T13.

export interface SqlQuery {
	text: string
	params: unknown[]
}

/** Ledger Entry history, first page. $1 account id, $2 fetch size (page size + 1). */
export const HISTORY_FIRST_PAGE_SQL = `SELECT id, ledger_transaction_id, direction, amount, created_at
FROM ledger_entries
WHERE account_id = $1::uuid
ORDER BY created_at DESC, id DESC
LIMIT $2`

/** Ledger Entry history, next page. $1 account id, $2 and $3 cursor position, $4 fetch size. */
export const HISTORY_NEXT_PAGE_SQL = `SELECT id, ledger_transaction_id, direction, amount, created_at
FROM ledger_entries
WHERE account_id = $1::uuid
  AND (created_at, id) < ($2::timestamptz, $3::uuid)
ORDER BY created_at DESC, id DESC
LIMIT $4`

/** Wallet list, first page. $1 Merchant id, $2 fetch size (page size + 1). */
export const WALLET_LIST_FIRST_PAGE_SQL = `SELECT id, currency, created_at
FROM accounts
WHERE merchant_id = $1::uuid
  AND kind = 'WALLET'
ORDER BY created_at DESC, id DESC
LIMIT $2`

/** Wallet list, next page. $1 Merchant id, $2 and $3 cursor position, $4 fetch size. */
export const WALLET_LIST_NEXT_PAGE_SQL = `SELECT id, currency, created_at
FROM accounts
WHERE merchant_id = $1::uuid
  AND kind = 'WALLET'
  AND (created_at, id) < ($2::timestamptz, $3::uuid)
ORDER BY created_at DESC, id DESC
LIMIT $4`

/** Daily report. $1 Merchant id, $2 inclusive start instant, $3 exclusive end instant (UTC day bounds). */
export const DAILY_REPORT_SQL = `SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
       status,
       count(*)::bigint AS count,
       sum(amount)::bigint AS volume
FROM payments
WHERE merchant_id = $1::uuid
  AND created_at >= $2::timestamptz
  AND created_at < $3::timestamptz
GROUP BY 1, 2
ORDER BY 1 ASC, 2 ASC`

// Payment list: one fixed skeleton whose optional predicates are appended in a fixed
// order. Each optional line below is included only when its filter is present.
export const PAYMENT_LIST_SELECT_SQL = `SELECT id, source_account_id, destination_account_id, amount, currency, status,
       failure_reason, ledger_transaction_id, created_at, updated_at
FROM payments
WHERE merchant_id = $1::uuid`

export const PAYMENT_LIST_ACCOUNT_SQL = (n: number) =>
	`  AND (source_account_id = $${n}::uuid OR destination_account_id = $${n}::uuid)`
export const PAYMENT_LIST_STATUS_SQL = (n: number) => `  AND status = $${n}::payment_status`
export const PAYMENT_LIST_FROM_SQL = (n: number) => `  AND created_at >= $${n}::timestamptz`
export const PAYMENT_LIST_TO_SQL = (n: number) => `  AND created_at < $${n}::timestamptz`
export const PAYMENT_LIST_CURSOR_SQL = (n: number) =>
	`  AND (created_at, id) < ($${n}::timestamptz, $${n + 1}::uuid)`
export const PAYMENT_LIST_ORDER_SQL = (n: number) => `ORDER BY created_at DESC, id DESC
LIMIT $${n}`

export interface PaymentListFilters {
	merchantId: string
	accountId?: string
	status?: string
	from?: Date
	to?: Date
	after?: { createdAt: Date; id: string }
	/** Rows to fetch: page size + 1, so the caller can tell whether another page exists. */
	fetch: number
}

/** Builds the Payment list query for exactly the filters present. Parameters are positional. */
export function buildPaymentListQuery(filters: PaymentListFilters): SqlQuery {
	const params: unknown[] = [filters.merchantId]
	const lines = [PAYMENT_LIST_SELECT_SQL]
	const next = () => params.length + 1

	if (filters.accountId !== undefined) {
		lines.push(PAYMENT_LIST_ACCOUNT_SQL(next()))
		params.push(filters.accountId)
	}
	if (filters.status !== undefined) {
		lines.push(PAYMENT_LIST_STATUS_SQL(next()))
		params.push(filters.status)
	}
	if (filters.from !== undefined) {
		lines.push(PAYMENT_LIST_FROM_SQL(next()))
		params.push(filters.from)
	}
	if (filters.to !== undefined) {
		lines.push(PAYMENT_LIST_TO_SQL(next()))
		params.push(filters.to)
	}
	if (filters.after !== undefined) {
		lines.push(PAYMENT_LIST_CURSOR_SQL(next()))
		params.push(filters.after.createdAt, filters.after.id)
	}

	lines.push(PAYMENT_LIST_ORDER_SQL(next()))
	params.push(filters.fetch)

	return { text: lines.join('\n'), params }
}
