import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { Payment } from '../../enterprise/entities/payment'
import { InvalidPaymentTransitionError } from '../../enterprise/errors/invalid-payment-transition-error'
import { PaymentsRepository } from '../repositories/payments-repository'
import { SettlementPort } from '../repositories/settlement-port'

interface SettlePaymentUseCaseRequest {
	paymentId: string
}

type SettlePaymentUseCaseResponse = Either<
	ResourceNotFoundError | InvalidPaymentTransitionError,
	{ payment: Payment }
>

@Injectable()
export class SettlePaymentUseCase {
	constructor(
		private paymentsRepository: PaymentsRepository,
		private settlement: SettlementPort,
	) {}

	async execute({ paymentId }: SettlePaymentUseCaseRequest): Promise<SettlePaymentUseCaseResponse> {
		const payment = await this.paymentsRepository.findById(paymentId)

		if (!payment) {
			return left(new ResourceNotFoundError())
		}

		const result = await this.settlement.settle(payment)

		if (result.isLeft()) {
			return left(result.value)
		}

		return right({ payment: result.value })
	}
}
