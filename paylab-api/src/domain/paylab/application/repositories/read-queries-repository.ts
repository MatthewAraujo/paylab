/** Keyset position of the last row already seen: creation time, then id. */
export interface KeysetPosition {
	createdAt: Date
	id: string
}

export interface LedgerEntryItem {
	id: string
	ledgerTransactionId: string
	direction: 'DEBIT' | 'CREDIT'
	/** Integer centavos. */
	amount: number
	createdAt: Date
}

export interface WalletListItem {
	id: string
	kind: 'WALLET'
	currency: string
	createdAt: Date
}

export interface PaymentListItem {
	id: string
	sourceAccountId: string
	destinationAccountId: string
	/** Integer centavos. */
	amount: number
	currency: string
	status: string
	failureReason: string | null
	ledgerTransactionId: string | null
	createdAt: Date
	updatedAt: Date
}

export interface PaymentListFilter {
	accountId?: string
	status?: string
	/** Inclusive. */
	from?: Date
	/** Exclusive. */
	to?: Date
}

export interface DailyReportRow {
	/** UTC calendar day, `YYYY-MM-DD`. */
	date: string
	status: string
	count: number
	/** Sum of the Payments' amounts in integer centavos. */
	volume: number
}

/**
 * Read-only, Merchant-facing queries. `fetch` is page size + 1: the caller fetches one
 * extra row to learn whether another page exists. Results are ordered newest first,
 * ties broken by id descending.
 */
export abstract class ReadQueriesRepository {
	abstract listEntries(input: {
		accountId: string
		after?: KeysetPosition
		fetch: number
	}): Promise<LedgerEntryItem[]>

	/** The Merchant's Wallets only: never the External Clearing Account, never another Merchant's. */
	abstract listWallets(input: {
		merchantId: string
		after?: KeysetPosition
		fetch: number
	}): Promise<WalletListItem[]>

	abstract listPayments(
		input: PaymentListFilter & { merchantId: string; after?: KeysetPosition; fetch: number },
	): Promise<PaymentListItem[]>

	/** Payments created in [from, to), grouped by UTC day and status, ordered by day then status. */
	abstract dailyReport(input: { merchantId: string; from: Date; to: Date }): Promise<
		DailyReportRow[]
	>
}
