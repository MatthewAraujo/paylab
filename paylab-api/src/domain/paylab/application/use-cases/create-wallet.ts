import { Either, left, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { Account, SUPPORTED_CURRENCY } from '../../enterprise/entities/account'
import { InvalidAccountError } from '../../enterprise/errors/invalid-account-error'
import { UnsupportedCurrencyError } from '../../enterprise/errors/unsupported-currency-error'
import { AccountsRepository } from '../repositories/accounts-repository'

interface CreateWalletUseCaseRequest {
	merchantId: string
}

type CreateWalletUseCaseResponse = Either<
	InvalidAccountError | UnsupportedCurrencyError,
	{ account: Account }
>

/** A Merchant's new Wallet always starts empty: no ledger entry exists until a Settlement. */
@Injectable()
export class CreateWalletUseCase {
	constructor(private accountsRepository: AccountsRepository) {}

	async execute({ merchantId }: CreateWalletUseCaseRequest): Promise<CreateWalletUseCaseResponse> {
		const result = Account.create({
			kind: 'WALLET',
			merchantId,
			currency: SUPPORTED_CURRENCY,
		})

		if (result.isLeft()) {
			return left(result.value)
		}

		await this.accountsRepository.create(result.value)

		return right({ account: result.value })
	}
}
