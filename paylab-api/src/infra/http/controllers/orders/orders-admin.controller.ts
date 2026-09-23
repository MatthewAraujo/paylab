import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { CancelOrderUseCase } from '@/domain/quintalpet/application/use-cases/cancel-order'
import { CreateWalkInOrderUseCase } from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { GetOrderUseCase } from '@/domain/quintalpet/application/use-cases/get-order'
import { ListOrdersUseCase } from '@/domain/quintalpet/application/use-cases/list-orders'
import { TransitionOrderStatusUseCase } from '@/domain/quintalpet/application/use-cases/transition-order-status'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { presentOrder } from '@/infra/http/controllers/orders/present-order'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { parsePaginationQuery } from '@/infra/http/pipes/pagination-query'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	NotFoundException,
	Patch,
	Post,
	Query,
	Req,
} from '@nestjs/common'
import { z } from 'zod'

const transitionStatusBodySchema = z.object({
	status: z.enum(['READY_FOR_PICKUP', 'SHIPPED', 'DELIVERED']),
})

type TransitionStatusBody = z.infer<typeof transitionStatusBodySchema>

// Accepts either an existing store customer or a guest name + phone (for a
// walk-in customer with no registered account) — exactly one of the two.
// The refinement here is a fast client-facing 400; Order.create() enforces
// the same invariant at the domain level as the single source of truth.
const createWalkInOrderBodySchema = z
	.object({
		storeCustomerId: z.string().uuid().optional(),
		guestName: z.string().trim().min(1).optional(),
		guestPhone: z.string().trim().min(1).optional(),
		paymentMethod: z.nativeEnum(OrderPaymentMethod),
		items: z
			.array(
				z.object({
					variantId: z.string().uuid(),
					quantity: z.number().int().positive(),
				}),
			)
			.min(1),
	})
	.refine((body) => Boolean(body.storeCustomerId) !== Boolean(body.guestName && body.guestPhone), {
		message: 'Provide exactly one of storeCustomerId or both guestName and guestPhone.',
	})

type CreateWalkInOrderBody = z.infer<typeof createWalkInOrderBodySchema>

@StoreMemberOnly()
@Controller('/api/v1/admin/stores/:storeId/orders')
export class OrdersAdminController {
	constructor(
		private readonly storesRepository: StoresRepository,
		private readonly listOrdersUseCase: ListOrdersUseCase,
		private readonly getOrderUseCase: GetOrderUseCase,
		private readonly transitionOrderStatusUseCase: TransitionOrderStatusUseCase,
		private readonly cancelOrderUseCase: CancelOrderUseCase,
		private readonly createWalkInOrderUseCase: CreateWalkInOrderUseCase,
	) {}

	@Post()
	@HttpCode(201)
	async createWalkIn(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@Body(new ZodValidationPipe(createWalkInOrderBodySchema)) body: CreateWalkInOrderBody,
	) {
		this.assertStoreAccess(request, storeId)
		const store = await this.storesRepository.findById(storeId)
		if (!store) {
			throw new NotFoundException('Store not found.')
		}

		try {
			const order = await this.createWalkInOrderUseCase.execute(storeId, store.slug, body)
			return presentOrder(order)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get()
	async list(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@Query('status') status?: string,
		@Query('storeCustomerId') storeCustomerId?: string,
		@Query('createdFrom') createdFrom?: string,
		@Query('createdTo') createdTo?: string,
		@Query('page') page?: string,
		@Query('perPage') perPage?: string,
	) {
		this.assertStoreAccess(request, storeId)

		const pagination = parsePaginationQuery({ page, perPage })
		const result = await this.listOrdersUseCase.execute(storeId, {
			status: this.parseStatus(status),
			storeCustomerId,
			createdFrom: createdFrom ? new Date(createdFrom) : undefined,
			createdTo: createdTo ? new Date(createdTo) : undefined,
			page: pagination.page ?? 1,
			perPage: pagination.perPage ?? 20,
		})
		return { items: result.items.map(presentOrder), total: result.total }
	}

	@Get('/:orderId')
	async get(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('orderId') orderId: string,
	) {
		this.assertStoreAccess(request, storeId)
		return presentOrder(await this.getOrderUseCase.execute(orderId, storeId))
	}

	@Patch('/:orderId/status')
	async transitionStatus(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('orderId') orderId: string,
		@Body(new ZodValidationPipe(transitionStatusBodySchema)) body: TransitionStatusBody,
	) {
		this.assertStoreAccess(request, storeId)
		try {
			const order = await this.transitionOrderStatusUseCase.execute(
				orderId,
				storeId,
				body.status as OrderStatus,
			)
			return presentOrder(order)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:orderId/cancel')
	@HttpCode(200)
	async cancel(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('orderId') orderId: string,
	) {
		this.assertStoreAccess(request, storeId)
		try {
			const order = await this.cancelOrderUseCase.execute(orderId, storeId)
			return presentOrder(order)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	private assertStoreAccess(request: { accessibleStores?: string[] }, storeId: string) {
		const accessibleStores = request.accessibleStores ?? []
		if (!accessibleStores.includes(storeId)) {
			throw new ForbiddenException('You do not have access to this store.')
		}
	}

	private parseStatus(status?: string): OrderStatus | undefined {
		if (!status) return undefined
		if (!Object.values(OrderStatus).includes(status as OrderStatus)) {
			throw new BadRequestException('Invalid status filter.')
		}
		return status as OrderStatus
	}
}
