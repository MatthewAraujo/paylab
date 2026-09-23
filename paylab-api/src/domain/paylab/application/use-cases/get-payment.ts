import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { Payment } from '../../enterprise/entities/payment'
import { PaymentsRepository } from '../repositories/payments-repository'

interface GetPaymentUseCaseRequest {
	merchantId: string
	paymentId: string
}

type GetPaymentUseCaseResponse = Either<ResourceNotFoundError, { payment: Payment }>

/** A Payment is readable only by the Merchant that created it; anything else is not found. */
@Injectable()
export class GetPaymentUseCase {
	constructor(private paymentsRepository: PaymentsRepository) {}

	async execute({
		merchantId,
		paymentId,
	}: GetPaymentUseCaseRequest): Promise<GetPaymentUseCaseResponse> {
		const payment = await this.paymentsRepository.findById(paymentId)

		if (!payment || payment.merchantId !== merchantId) {
			return left(new ResourceNotFoundError())
		}

		return right({ payment })
	}
}
