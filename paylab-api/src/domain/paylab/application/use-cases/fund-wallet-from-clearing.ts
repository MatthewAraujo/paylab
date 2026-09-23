import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { SUPPORTED_CURRENCY } from '../../enterprise/entities/account'
import { Payment } from '../../enterprise/entities/payment'
import { Amount } from '../../enterprise/entities/value-objects/amount'
import { InvalidAmountError } from '../../enterprise/errors/invalid-amount-error'
import { InvalidPaymentError } from '../../enterprise/errors/invalid-payment-error'
import { AccountsRepository } from '../repositories/accounts-repository'
import { PaymentSubmitter, SubmittedPayment } from '../services/payment-submitter'
import { requestFingerprint } from '../services/request-fingerprint'
import { IdempotencyKeyReusedError } from './errors/idempotency-key-reused-error'

interface FundWalletFromClearingUseCaseRequest {
	walletId: string
	amount: number
	idempotencyKey: string
}

type FundWalletFromClearingUseCaseResponse = Either<
	ResourceNotFoundError | InvalidAmountError | InvalidPaymentError | IdempotencyKeyReusedError,
	SubmittedPayment
>

/**
 * INTERNAL ONLY: the one way to put money into the platform, used by seed scripts
 * and tests. A Payment sourced from the External Clearing Account takes no lock
 * and runs no funds check. No controller may expose this use case: the public API
 * only accepts Wallet sources, so a Merchant can never mint money (US-25).
 */
@Injectable()
export class FundWalletFromClearingUseCase {
	constructor(
		private accountsRepository: AccountsRepository,
		private submitter: PaymentSubmitter,
	) {}

	async execute(
		request: FundWalletFromClearingUseCaseRequest,
	): Promise<FundWalletFromClearingUseCaseResponse> {
		const wallet = await this.accountsRepository.findById(request.walletId)

		if (!wallet || !wallet.isWallet() || !wallet.merchantId) {
			return left(new ResourceNotFoundError())
		}

		const clearing = await this.accountsRepository.findClearingAccount(SUPPORTED_CURRENCY)

		if (!clearing) {
			return left(new ResourceNotFoundError())
		}

		const amount = Amount.create(request.amount)

		if (amount.isLeft()) {
			return left(amount.value)
		}

		const fingerprint = requestFingerprint({
			sourceAccountId: clearing.id.toString(),
			destinationAccountId: wallet.id.toString(),
			amount: request.amount,
			currency: wallet.currency,
		})
		const replay = await this.submitter.replayIfExists(
			wallet.merchantId,
			request.idempotencyKey,
			fingerprint,
		)

		if (replay) {
			return replay
		}

		const payment = Payment.create({
			merchantId: wallet.merchantId,
			source: clearing,
			destination: wallet,
			amount: amount.value,
			idempotencyKey: request.idempotencyKey,
			requestFingerprint: fingerprint,
		})

		if (payment.isLeft()) {
			return left(payment.value)
		}

		return this.submitter.submit(payment.value)
	}
}
