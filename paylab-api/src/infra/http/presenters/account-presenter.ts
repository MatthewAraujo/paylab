import { LedgerEntryItem } from '@/domain/paylab/application/repositories/read-queries-repository'
import { Account } from '@/domain/paylab/enterprise/entities/account'

export interface AccountView {
	id: string
	kind: string
	currency: string
}

export interface BalanceView {
	accountId: string
	/** Integer centavos. */
	balance: number
	currency: string
}

export interface LedgerEntryView {
	id: string
	ledgerTransactionId: string
	direction: 'DEBIT' | 'CREDIT'
	/** Integer centavos, always positive; the sign comes from direction. */
	amount: number
	createdAt: string
}

export class AccountPresenter {
	static entryToHTTP(entry: LedgerEntryItem): LedgerEntryView {
		return {
			id: entry.id,
			ledgerTransactionId: entry.ledgerTransactionId,
			direction: entry.direction,
			amount: entry.amount,
			createdAt: entry.createdAt.toISOString(),
		}
	}

	static toHTTP(account: Account): AccountView {
		return { id: account.id.toString(), kind: account.kind, currency: account.currency }
	}

	static balanceToHTTP(accountId: string, balance: number, currency: string): BalanceView {
		return { accountId, balance, currency }
	}
}
