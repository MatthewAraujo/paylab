import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { Account } from '../../enterprise/entities/account'
import { AccountsRepository } from '../repositories/accounts-repository'

interface GetAccountUseCaseRequest {
	merchantId: string
	accountId: string
}

type GetAccountUseCaseResponse = Either<ResourceNotFoundError, { account: Account }>

/**
 * Returns a Wallet only to its owner. An unknown id, another Merchant's Wallet
 * and the External Clearing Account all produce the same not-found, so a
 * Merchant cannot discover other Accounts (US-8).
 */
@Injectable()
export class GetAccountUseCase {
	constructor(private accountsRepository: AccountsRepository) {}

	async execute({
		merchantId,
		accountId,
	}: GetAccountUseCaseRequest): Promise<GetAccountUseCaseResponse> {
		const account = await this.accountsRepository.findById(accountId)

		if (!account || !account.isWallet() || account.merchantId !== merchantId) {
			return left(new ResourceNotFoundError())
		}

		return right({ account })
	}
}
