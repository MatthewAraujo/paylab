import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { AccountsRepository } from '../repositories/accounts-repository'

interface GetAccountBalanceUseCaseRequest {
	accountId: string
}

type GetAccountBalanceUseCaseResponse = Either<ResourceNotFoundError, { balance: number }>

/** The Balance is derived from the ledger on every call, never read from a stored value. */
@Injectable()
export class GetAccountBalanceUseCase {
	constructor(private accountsRepository: AccountsRepository) {}

	async execute({
		accountId,
	}: GetAccountBalanceUseCaseRequest): Promise<GetAccountBalanceUseCaseResponse> {
		const account = await this.accountsRepository.findById(accountId)

		if (!account) {
			return left(new ResourceNotFoundError())
		}

		return right({ balance: await this.accountsRepository.getBalance(accountId) })
	}
}
