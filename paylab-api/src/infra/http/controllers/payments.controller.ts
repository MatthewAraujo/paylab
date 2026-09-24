import { CreatePaymentUseCase } from '@/domain/paylab/application/use-cases/create-payment'
import { GetPaymentUseCase } from '@/domain/paylab/application/use-cases/get-payment'
import { ListPaymentsUseCase } from '@/domain/paylab/application/use-cases/list-payments'
import { ApiKeyGuard } from '@/infra/auth/api-key.guard'
import { CurrentMerchant, MerchantContext } from '@/infra/auth/current-merchant.decorator'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { cursorSchema, instantSchema, limitSchema } from '@/infra/http/pagination/query-schemas'
import { IdempotencyKey } from '@/infra/http/pipes/idempotency-key.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiHeader, ApiQuery, ApiTags } from '@nestjs/swagger'
import type { Response } from 'express'
import { z } from 'zod'
import { ApiIdParam, ApiPageQuery, ApiReadRoute } from '../openapi/decorators'
import { PAYMENT_STATUSES, PaymentPageResponse, PaymentResponse } from '../openapi/responses'
import { KeysetPagePresenter } from '../presenters/keyset-page-presenter'
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

// Cursor-only keyset pagination; `from` is inclusive and `to` exclusive. Unknown
// parameters (offset, page) are rejected.
const listQuerySchema = z
	.object({
		limit: limitSchema,
		cursor: cursorSchema.optional(),
		accountId: z.string().uuid().optional(),
		status: z.enum(['CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED']).optional(),
		from: instantSchema.optional(),
		to: instantSchema.optional(),
	})
	.strict()
	.refine((query) => !query.from || !query.to || query.from < query.to, {
		message: '`from` must be before `to`.',
		path: ['from'],
	})

type ListQuery = z.infer<typeof listQuerySchema>

const idempotencyKeyPipe = new ZodValidationPipe(z.string().trim().min(1).max(255))
const paymentIdPipe = new ZodValidationPipe(z.string().uuid())

@ApiTags('Payments')
@Controller('v1/payments')
@UseGuards(ApiKeyGuard)
export class PaymentsController {
	constructor(
		private createPayment: CreatePaymentUseCase,
		private getPayment: GetPaymentUseCase,
		private listPayments: ListPaymentsUseCase,
	) {}

	// 201 for a newly created Payment, 200 when the Idempotency Key already existed.
	// A funds failure is a successful response whose Payment is FAILED.
	@Post()
	@ApiBearerAuth()
	@ApiHeader({ name: 'Idempotency-Key', required: true })
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

	@Get()
	@ApiReadRoute(PaymentPageResponse, { validated: true })
	@ApiPageQuery()
	@ApiQuery({ name: 'accountId', required: false, schema: { type: 'string', format: 'uuid' } })
	@ApiQuery({ name: 'status', required: false, enum: PAYMENT_STATUSES })
	@ApiQuery({
		name: 'from',
		required: false,
		description: 'Inclusive. ISO 8601 timestamp with a zone, or a YYYY-MM-DD day (00:00 UTC).',
		schema: { type: 'string' },
	})
	@ApiQuery({
		name: 'to',
		required: false,
		description: 'Exclusive. Same format as `from`.',
		schema: { type: 'string' },
	})
	async list(
		@CurrentMerchant() merchant: MerchantContext,
		@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery,
	) {
		const page = await this.listPayments.execute({
			merchantId: merchant.id,
			pageSize: query.limit,
			after: query.cursor,
			accountId: query.accountId,
			status: query.status,
			from: query.from,
			to: query.to,
		})

		return KeysetPagePresenter.toHTTP(page, PaymentPresenter.listItemToHTTP)
	}

	@Get(':id')
	@ApiReadRoute(PaymentResponse, { notFound: true, validated: true })
	@ApiIdParam()
	async get(@CurrentMerchant() merchant: MerchantContext, @Param('id', paymentIdPipe) id: string) {
		const result = await this.getPayment.execute({ merchantId: merchant.id, paymentId: id })

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		return PaymentPresenter.toHTTP(result.value.payment)
	}
}
