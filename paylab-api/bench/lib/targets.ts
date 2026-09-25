import type { Pool } from 'pg'

export interface Targets {
	hotWallet: string
	coldWallet: string
	hotMerchant: string
	coldMerchant: string
	/** The busiest Wallet of each Merchant, used for the account filter. */
	hotMerchantWallet: string
	coldMerchantWallet: string
	/**
	 * UTC day of the first Wallet-to-Wallet transfer, as YYYY-MM-DD (funding Payments come
	 * earlier and are not part of it); the report and period ranges hang off it.
	 */
	transferStartDay: string
	rowCounts: {
		hotWalletEntries: number
		coldWalletEntries: number
		hotMerchantPayments: number
		coldMerchantPayments: number
	}
}

async function one<T>(pool: Pool, sql: string, params: unknown[] = []): Promise<T> {
	const { rows } = await pool.query(sql, params)
	return Object.values(rows[0])[0] as T
}

/**
 * The hot and cold Wallet and Merchant of the loaded dataset, found from the data itself
 * (most and fewest entries or Payments, id as the tie-break), so they are deterministic for
 * a given seed and never hardcoded. Same definitions as `pnpm bench:targets`.
 */
export async function discoverTargets(pool: Pool): Promise<Targets> {
	const wallet = (order: 'DESC' | 'ASC') =>
		one<string>(
			pool,
			`SELECT a.id FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
			 WHERE a.kind = 'WALLET' GROUP BY a.id ORDER BY count(*) ${order}, a.id LIMIT 1`,
		)
	const merchant = (order: 'DESC' | 'ASC') =>
		one<string>(
			pool,
			`SELECT merchant_id FROM payments GROUP BY merchant_id ORDER BY count(*) ${order}, merchant_id LIMIT 1`,
		)
	const busiestWalletOf = (merchantId: string) =>
		one<string>(
			pool,
			`SELECT a.id FROM accounts a JOIN ledger_entries e ON e.account_id = a.id
			 WHERE a.merchant_id = $1 AND a.kind = 'WALLET' GROUP BY a.id ORDER BY count(*) DESC, a.id LIMIT 1`,
			[merchantId],
		)
	const entriesOf = async (walletId: string) =>
		Number(
			await one<string>(pool, 'SELECT count(*) FROM ledger_entries WHERE account_id = $1', [
				walletId,
			]),
		)
	const paymentsOf = async (merchantId: string) =>
		Number(
			await one<string>(pool, 'SELECT count(*) FROM payments WHERE merchant_id = $1', [merchantId]),
		)

	const hotWallet = await wallet('DESC')
	const coldWallet = await wallet('ASC')
	const hotMerchant = await merchant('DESC')
	const coldMerchant = await merchant('ASC')

	return {
		hotWallet,
		coldWallet,
		hotMerchant,
		coldMerchant,
		hotMerchantWallet: await busiestWalletOf(hotMerchant),
		coldMerchantWallet: await busiestWalletOf(coldMerchant),
		transferStartDay: await one<string>(
			pool,
			`SELECT to_char(date_trunc('day', min(p.created_at) AT TIME ZONE 'UTC'), 'YYYY-MM-DD')
			 FROM payments p JOIN accounts a ON a.id = p.source_account_id WHERE a.kind = 'WALLET'`,
		),
		rowCounts: {
			hotWalletEntries: await entriesOf(hotWallet),
			coldWalletEntries: await entriesOf(coldWallet),
			hotMerchantPayments: await paymentsOf(hotMerchant),
			coldMerchantPayments: await paymentsOf(coldMerchant),
		},
	}
}
