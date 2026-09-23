import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { AccountsRepository } from '../repositories/accounts-repository'

interface GetAccountBalanceUseCaseRequest {
	accountId: string
	/** When given, only that Merchant's own Wallet is readable (the HTTP path always passes it). */
	merchantId?: string
}

type GetAccountBalanceUseCaseResponse = Either<
	ResourceNotFoundError,
	{ balance: number; currency: string }
>

/** The Balance is derived from the ledger on every call, never read from a stored value. */
@Injectable()
export class GetAccountBalanceUseCase {
	constructor(private accountsRepository: AccountsRepository) {}

	async execute({
		accountId,
		merchantId,
	}: GetAccountBalanceUseCaseRequest): Promise<GetAccountBalanceUseCaseResponse> {
		const account = await this.accountsRepository.findById(accountId)

		if (!account) {
			return left(new ResourceNotFoundError())
		}

		if (merchantId !== undefined && (!account.isWallet() || account.merchantId !== merchantId)) {
			return left(new ResourceNotFoundError())
		}

		return right({
			balance: await this.accountsRepository.getBalance(accountId),
			currency: account.currency,
		})
	}
}
