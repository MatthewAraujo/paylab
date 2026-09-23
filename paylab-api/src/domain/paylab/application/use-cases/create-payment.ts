import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { SUPPORTED_CURRENCY } from '../../enterprise/entities/account'
import { Payment } from '../../enterprise/entities/payment'
import { Amount } from '../../enterprise/entities/value-objects/amount'
import { InvalidAmountError } from '../../enterprise/errors/invalid-amount-error'
import { InvalidPaymentError } from '../../enterprise/errors/invalid-payment-error'
import { UnsupportedCurrencyError } from '../../enterprise/errors/unsupported-currency-error'
import { AccountsRepository } from '../repositories/accounts-repository'
import { PaymentSubmitter, SubmittedPayment } from '../services/payment-submitter'
import { requestFingerprint } from '../services/request-fingerprint'
import { DestinationAccountNotFoundError } from './errors/destination-account-not-found-error'
import { IdempotencyKeyReusedError } from './errors/idempotency-key-reused-error'

interface CreatePaymentUseCaseRequest {
	merchantId: string
	idempotencyKey: string
	sourceAccountId: string
	destinationAccountId: string
	amount: number
	currency: string
}

type CreatePaymentUseCaseResponse = Either<
	| ResourceNotFoundError
	| DestinationAccountNotFoundError
	| IdempotencyKeyReusedError
	| InvalidAmountError
	| InvalidPaymentError
	| UnsupportedCurrencyError,
	SubmittedPayment
>

/**
 * Public Payment creation. The source must be a Wallet of the authenticated
 * Merchant; a missing, foreign or clearing source is the same not-found, so a
 * Merchant can neither discover nor spend accounts that are not theirs.
 */
@Injectable()
export class CreatePaymentUseCase {
	constructor(
		private accountsRepository: AccountsRepository,
		private submitter: PaymentSubmitter,
	) {}

	async execute(request: CreatePaymentUseCaseRequest): Promise<CreatePaymentUseCaseResponse> {
		const fingerprint = requestFingerprint(request)

		// A known key answers before any validation: a replay returns the original outcome.
		const replay = await this.submitter.replayIfExists(
			request.merchantId,
			request.idempotencyKey,
			fingerprint,
		)

		if (replay) {
			return replay
		}

		const amount = Amount.create(request.amount)

		if (amount.isLeft()) {
			return left(amount.value)
		}

		if (request.currency !== SUPPORTED_CURRENCY) {
			return left(new UnsupportedCurrencyError(request.currency))
		}

		const source = await this.accountsRepository.findById(request.sourceAccountId)

		if (!source || !source.isWallet() || source.merchantId !== request.merchantId) {
			return left(new ResourceNotFoundError())
		}

		const destination = await this.accountsRepository.findById(request.destinationAccountId)

		if (!destination) {
			return left(new DestinationAccountNotFoundError())
		}

		const payment = Payment.create({
			merchantId: request.merchantId,
			source,
			destination,
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
