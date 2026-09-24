import type { Pool } from 'pg'
import { fingerprint } from '../../src/domain/benchmark/canonical'
import type { Targets } from '../lib/targets'

// The T13 read experiments as registered scenarios: the documented read queries (see
// docs/reads-sql.md) against a hot and a cold Wallet and Merchant, plus keyset versus offset
// pagination at increasing depth. Targets are symbolic here and resolved from the loaded
// dataset when a scenario runs; the SQL text hash is part of the definition, so a changed
// query is a changed workload.

export interface ResolveContext {
	pool: Pool
	targets: Targets
}

export interface ReadQueryDef {
	id: string
	title: string
	config: Record<string, unknown> & { sqlSha: string }
	/** SQL with `{name}` placeholders, filled by `resolve` at run time. */
	template: string
	resolve(context: ResolveContext): Promise<Record<string, string>>
}

const SAFE_VALUE = /^[A-Za-z0-9:.+\- ]*$/

export function render(template: string, values: Record<string, string>): string {
	return template.replace(/\{(\w+)\}/g, (_match, key: string) => {
		const value = values[key]
		if (value === undefined) {
			throw new Error(`No value for placeholder {${key}}`)
		}
		if (!SAFE_VALUE.test(value)) {
			throw new Error(`Unsafe value for placeholder {${key}}`)
		}
		return value
	})
}

type Subject = 'hot' | 'cold'
const PAGE = 21

const ENTRY_COLUMNS = 'id, ledger_transaction_id, direction, amount, created_at'
const PAYMENT_COLUMNS =
	'id, source_account_id, destination_account_id, amount, currency, status, failure_reason, ledger_transaction_id, created_at, updated_at'
const ENTRY_ORDER = `ORDER BY created_at DESC, id DESC LIMIT ${PAGE}`

const entriesFirst = `SELECT ${ENTRY_COLUMNS} FROM ledger_entries WHERE account_id = '{wallet}'::uuid ${ENTRY_ORDER}`
const entriesNext = `SELECT ${ENTRY_COLUMNS} FROM ledger_entries WHERE account_id = '{wallet}'::uuid AND (created_at, id) < ('{ts}'::timestamptz, '{cursorId}'::uuid) ${ENTRY_ORDER}`
const paymentsBase = `SELECT ${PAYMENT_COLUMNS} FROM payments WHERE merchant_id = '{merchant}'::uuid`
const paymentsTail = ` ORDER BY created_at DESC, id DESC LIMIT ${PAGE}`

// Requested keyset positions (rows skipped) from the T13 experiments.
const WALLET_NEXT_OFFSET: Record<Subject, number> = { hot: 50_000, cold: 400 }
const MERCHANT_DEEP_OFFSET: Record<Subject, number> = { hot: 30_000, cold: 3_000 }
const DEPTHS = [0, 1_000, 10_000, 50_000, 90_000]

function define(input: {
	id: string
	title: string
	config: Record<string, unknown>
	template: string
	resolve: ReadQueryDef['resolve']
}): ReadQueryDef {
	return {
		...input,
		config: { ...input.config, pageSize: PAGE, sqlSha: fingerprint(input.template) },
	}
}

/** Never ask for a position deeper than the rows that exist, so a small dataset still runs. */
const reachable = (requested: number, rows: number) => Math.min(requested, Math.max(0, rows - PAGE))

async function cursorAt(
	pool: Pool,
	table: 'ledger_entries' | 'payments',
	column: 'account_id' | 'merchant_id',
	id: string,
	offset: number,
) {
	const { rows } = await pool.query<{ ts: string; id: string }>(
		`SELECT created_at::text AS ts, id FROM ${table} WHERE ${column} = $1 ORDER BY created_at DESC, id DESC OFFSET ${Math.trunc(offset)} LIMIT 1`,
		[id],
	)
	if (!rows[0]) {
		throw new Error(`No row at position ${offset} of ${table} for ${id}`)
	}
	return { ts: rows[0].ts, cursorId: rows[0].id }
}

const walletOf = (subject: Subject, t: Targets) => (subject === 'hot' ? t.hotWallet : t.coldWallet)
const merchantOf = (subject: Subject, t: Targets) =>
	subject === 'hot' ? t.hotMerchant : t.coldMerchant
const walletRows = (subject: Subject, t: Targets) =>
	subject === 'hot' ? t.rowCounts.hotWalletEntries : t.rowCounts.coldWalletEntries
const merchantRows = (subject: Subject, t: Targets) =>
	subject === 'hot' ? t.rowCounts.hotMerchantPayments : t.rowCounts.coldMerchantPayments

// Second month and whole dataset, as in the T13 experiments (2026-07-01..07-31, 05-31..08-30).
function addDays(day: string, days: number): string {
	const date = new Date(`${day}T00:00:00Z`)
	date.setUTCDate(date.getUTCDate() + days)
	return date.toISOString().slice(0, 10)
}
const periodValues = (t: Targets) => ({
	from: `${addDays(t.transferStartDay, 30)}T00:00:00Z`,
	to: `${addDays(t.transferStartDay, 60)}T00:00:00Z`,
})

function walletQueries(subject: Subject): ReadQueryDef[] {
	const label = `${subject}-wallet`
	return [
		define({
			id: `t13.history.first-page.${label}`,
			title: `Ledger Entry history, first page (${subject} Wallet)`,
			config: { shape: 'history-first-page', subject: label },
			template: entriesFirst,
			resolve: async ({ targets }) => ({ wallet: walletOf(subject, targets) }),
		}),
		define({
			id: `t13.history.next-page.${label}`,
			title: `Ledger Entry history, next page in the middle (${subject} Wallet)`,
			config: {
				shape: 'history-next-page',
				subject: label,
				requestedOffset: WALLET_NEXT_OFFSET[subject],
			},
			template: entriesNext,
			resolve: async ({ pool, targets }) => {
				const wallet = walletOf(subject, targets)
				const offset = reachable(WALLET_NEXT_OFFSET[subject], walletRows(subject, targets))
				return { wallet, ...(await cursorAt(pool, 'ledger_entries', 'account_id', wallet, offset)) }
			},
		}),
		define({
			id: `t13.balance.${label}`,
			title: `Balance (${subject} Wallet)`,
			config: { shape: 'balance', subject: label },
			template:
				"SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance FROM ledger_entries WHERE account_id = '{wallet}'::uuid",
			resolve: async ({ targets }) => ({ wallet: walletOf(subject, targets) }),
		}),
	]
}

function merchantQueries(subject: Subject): ReadQueryDef[] {
	const label = `${subject}-merchant`
	const merchant = async ({ targets }: ResolveContext) => ({
		merchant: merchantOf(subject, targets),
	})
	const simple = (
		slug: string,
		title: string,
		shape: string,
		template: string,
		resolve: ReadQueryDef['resolve'] = merchant,
	) =>
		define({
			id: `t13.${slug}.${label}`,
			title: `${title} (${subject} Merchant)`,
			config: { shape, subject: label },
			template,
			resolve,
		})

	return [
		simple(
			'payments.first-page',
			'Payment list, first page',
			'payments-first-page',
			paymentsBase + paymentsTail,
		),
		define({
			id: `t13.payments.next-page-deep.${label}`,
			title: `Payment list, deep next page (${subject} Merchant)`,
			config: {
				shape: 'payments-next-page-deep',
				subject: label,
				requestedOffset: MERCHANT_DEEP_OFFSET[subject],
			},
			template: `${paymentsBase} AND (created_at, id) < ('{ts}'::timestamptz, '{cursorId}'::uuid)${paymentsTail}`,
			resolve: async ({ pool, targets }) => {
				const id = merchantOf(subject, targets)
				const offset = reachable(MERCHANT_DEEP_OFFSET[subject], merchantRows(subject, targets))
				return { merchant: id, ...(await cursorAt(pool, 'payments', 'merchant_id', id, offset)) }
			},
		}),
		simple(
			'payments.status-created',
			'Payment list, status CREATED',
			'payments-status-created',
			`${paymentsBase} AND status = 'CREATED'::payment_status${paymentsTail}`,
		),
		simple(
			'payments.status-failed',
			'Payment list, status FAILED',
			'payments-status-failed',
			`${paymentsBase} AND status = 'FAILED'::payment_status${paymentsTail}`,
		),
		simple(
			'payments.account-filter',
			'Payment list, account filter',
			'payments-account-filter',
			`${paymentsBase} AND (source_account_id = '{account}'::uuid OR destination_account_id = '{account}'::uuid)${paymentsTail}`,
			async ({ targets }) => ({
				merchant: merchantOf(subject, targets),
				account: subject === 'hot' ? targets.hotMerchantWallet : targets.coldMerchantWallet,
			}),
		),
		simple(
			'payments.period-30d',
			'Payment list, 30-day period',
			'payments-period-30d',
			`${paymentsBase} AND created_at >= '{from}'::timestamptz AND created_at < '{to}'::timestamptz${paymentsTail}`,
			async ({ targets }) => ({ merchant: merchantOf(subject, targets), ...periodValues(targets) }),
		),
		...(['30d', '90d'] as const).map((span) =>
			simple(
				`report.${span}`,
				`Daily report, ${span}`,
				`report-${span}`,
				"SELECT to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day, status, count(*)::bigint AS count, sum(amount)::bigint AS volume FROM payments WHERE merchant_id = '{merchant}'::uuid AND created_at >= '{from}'::timestamptz AND created_at < '{to}'::timestamptz GROUP BY 1, 2 ORDER BY 1 ASC, 2 ASC",
				async ({ targets }) => ({
					merchant: merchantOf(subject, targets),
					...(span === '30d'
						? periodValues(targets)
						: {
								from: `${addDays(targets.transferStartDay, -1)}T00:00:00Z`,
								to: `${addDays(targets.transferStartDay, 90)}T00:00:00Z`,
							}),
				}),
			),
		),
	]
}

// A Wallet of the hottest Merchant filtered on the coldest Merchant's Payments: matches almost
// nothing, the worst case of the account filter.
const rareAccountFilter = define({
	id: 't13.payments.account-filter-rare.cold-merchant',
	title: 'Payment list, account filter with a rare match (cold Merchant)',
	config: { shape: 'payments-account-filter-rare', subject: 'cold-merchant' },
	template: `${paymentsBase} AND (source_account_id = '{account}'::uuid OR destination_account_id = '{account}'::uuid)${paymentsTail}`,
	resolve: async ({ targets }) => ({
		merchant: targets.coldMerchant,
		account: targets.hotMerchantWallet,
	}),
})

// Keyset versus offset on the hot Wallet, at increasing depth.
function depthQueries(): ReadQueryDef[] {
	return DEPTHS.flatMap((depth) => {
		const keysetTemplate = depth === 0 ? entriesFirst : entriesNext
		return [
			define({
				id: `t13.depth.keyset.${depth}`,
				title: `History at depth ${depth}, keyset`,
				config: { shape: 'depth-keyset', subject: 'hot-wallet', requestedDepth: depth },
				template: keysetTemplate,
				resolve: async ({ pool, targets }) => {
					const wallet = targets.hotWallet
					const skipped = reachable(depth, targets.rowCounts.hotWalletEntries)
					if (skipped === 0) return { wallet }
					return {
						wallet,
						...(await cursorAt(pool, 'ledger_entries', 'account_id', wallet, skipped - 1)),
					}
				},
			}),
			define({
				id: `t13.depth.offset.${depth}`,
				title: `History at depth ${depth}, offset`,
				config: { shape: 'depth-offset', subject: 'hot-wallet', requestedDepth: depth },
				template: `SELECT ${ENTRY_COLUMNS} FROM ledger_entries WHERE account_id = '{wallet}'::uuid ${ENTRY_ORDER} OFFSET {skipped}`,
				resolve: async ({ targets }) => ({
					wallet: targets.hotWallet,
					skipped: String(reachable(depth, targets.rowCounts.hotWalletEntries)),
				}),
			}),
		]
	})
}

export const T13_QUERIES: ReadQueryDef[] = [
	...walletQueries('hot'),
	...walletQueries('cold'),
	...merchantQueries('hot'),
	...merchantQueries('cold'),
	rareAccountFilter,
	...depthQueries(),
]
