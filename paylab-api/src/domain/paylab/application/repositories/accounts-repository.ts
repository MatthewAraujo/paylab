import { Account } from '../../enterprise/entities/account'

export abstract class AccountsRepository {
	abstract findById(id: string): Promise<Account | null>
	abstract create(account: Account): Promise<void>
	/** Balance is derived from the ledger (credits minus debits), never stored. */
	abstract getBalance(accountId: string): Promise<number>
}
