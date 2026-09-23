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

export class AccountPresenter {
	static toHTTP(account: Account): AccountView {
		return { id: account.id.toString(), kind: account.kind, currency: account.currency }
	}

	static balanceToHTTP(accountId: string, balance: number, currency: string): BalanceView {
		return { accountId, balance, currency }
	}
}
