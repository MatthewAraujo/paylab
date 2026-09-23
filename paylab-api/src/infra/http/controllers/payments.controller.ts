import { CreatePaymentUseCase } from '@/domain/paylab/application/use-cases/create-payment'
import { GetPaymentUseCase } from '@/domain/paylab/application/use-cases/get-payment'
import { ApiKeyGuard } from '@/infra/auth/api-key.guard'
import { CurrentMerchant, MerchantContext } from '@/infra/auth/current-merchant.decorator'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { IdempotencyKey } from '@/infra/http/pipes/idempotency-key.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common'
import type { Response } from 'express'
import { z } from 'zod'
import { PaymentPresenter } from '../presenters/payment-presenter'

const createPaymentBodySchema = z
	.object({
		sourceAccountId: z.string().uuid(),
		destinationAccountId: z.string().uuid(),
		// Integer centavos; safe() keeps it inside the range the domain Amount accepts.
		amount: z.number().int().safe(),
		currency: z.string().min(1),
	})
	.strict()

type CreatePaymentBody = z.infer<typeof createPaymentBodySchema>

const idempotencyKeyPipe = new ZodValidationPipe(z.string().trim().min(1).max(255))
const paymentIdPipe = new ZodValidationPipe(z.string().uuid())

@Controller('v1/payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
	constructor(
		private createPayment: CreatePaymentUseCase,
		private getPayment: GetPaymentUseCase,
	) {}

	// 201 for a newly created Payment, 200 when the Idempotency Key already existed.
	// A funds failure is a successful response whose Payment is FAILED.
	@Post()
	async create(
		@CurrentMerchant() merchant: MerchantContext,
		@IdempotencyKey(idempotencyKeyPipe) idempotencyKey: string,
		@Body(new ZodValidationPipe(createPaymentBodySchema)) body: CreatePaymentBody,
		@Res({ passthrough: true }) response: Response,
	) {
		const result = await this.createPayment.execute({
			merchantId: merchant.id,
			idempotencyKey,
			...body,
		})

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		response.status(result.value.replayed ? 200 : 201)

		return PaymentPresenter.toHTTP(result.value.payment)
	}

	@Get(':id')
	async get(@CurrentMerchant() merchant: MerchantContext, @Param('id', paymentIdPipe) id: string) {
		const result = await this.getPayment.execute({ merchantId: merchant.id, paymentId: id })

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		return PaymentPresenter.toHTTP(result.value.payment)
	}
}
