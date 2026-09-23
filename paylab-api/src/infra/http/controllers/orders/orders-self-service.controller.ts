import {
	StoreSummary,
	StoresRepository,
} from '@/domain/quintalpet/application/repositories/stores-repository'
import { GetOrCreateStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/get-or-create-store-customer'
import { GetOrderUseCase } from '@/domain/quintalpet/application/use-cases/get-order'
import { ListOrdersUseCase } from '@/domain/quintalpet/application/use-cases/list-orders'
import {
	PlaceOrderInput,
	PlaceOrderUseCase,
} from '@/domain/quintalpet/application/use-cases/place-order'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { CustomerOnly } from '@/infra/better-auth/decorators'
import { presentOrder } from '@/infra/http/controllers/orders/present-order'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { parsePaginationQuery } from '@/infra/http/pipes/pagination-query'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	NotFoundException,
	Param,
	Post,
	Query,
	Req,
	ServiceUnavailableException,
} from '@nestjs/common'
import { z } from 'zod'

const placeOrderBodySchema = z.object({
	addressId: z.string().min(1),
	// The fee/label charged for this option are resolved server-side
	// (resolveDeliveryOption) — only the id is client input. A client-sent
	// shippingCents/deliveryLabel would just be dropped here, since they're
	// not part of this schema.
	deliveryOptionId: z.string().min(1),
	paymentMethod: z.nativeEnum(OrderPaymentMethod),
	items: z
		.array(z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1) }))
		.min(1),
	// Optional storefront coupon. Discounts are recomputed server-side; a
	// client-sent total/discount is never trusted.
	couponCode: z.string().trim().min(1).max(64).optional(),
})

type PlaceOrderBody = z.infer<typeof placeOrderBodySchema>

@CustomerOnly()
@Controller('/api/v1/stores/:storeSlug/account/orders')
export class OrdersSelfServiceController {
	constructor(
		private readonly storesRepository: StoresRepository,
		private readonly getOrCreateStoreCustomerUseCase: GetOrCreateStoreCustomerUseCase,
		private readonly placeOrderUseCase: PlaceOrderUseCase,
		private readonly listOrdersUseCase: ListOrdersUseCase,
		private readonly getOrderUseCase: GetOrderUseCase,
	) {}

	@Post()
	@HttpCode(201)
	async place(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Body(new ZodValidationPipe(placeOrderBodySchema)) body: PlaceOrderBody,
	) {
		const store = await this.requireStore(storeSlug)
		const storeCustomer = await this.provisionMyStoreCustomer(request, store)

		try {
			const order = await this.placeOrderUseCase.execute(
				store.id,
				store.slug,
				storeCustomer.id.toString(),
				body as PlaceOrderInput,
			)
			return presentOrder(order)
		} catch (error) {
			if (error instanceof GeocoderUnavailableError) {
				throw new ServiceUnavailableException({
					code: 'SHIPPING_QUOTE_UNAVAILABLE',
					message: 'Não foi possível calcular o frete agora. Tente novamente.',
				})
			}
			throwTranslatedDomainError(error)
		}
	}

	@Get()
	async list(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Query('page') page?: string,
		@Query('perPage') perPage?: string,
	) {
		const store = await this.requireStore(storeSlug)
		const storeCustomer = await this.provisionMyStoreCustomer(request, store)

		const pagination = parsePaginationQuery({ page, perPage })
		const result = await this.listOrdersUseCase.execute(store.id, {
			storeCustomerId: storeCustomer.id.toString(),
			page: pagination.page ?? 1,
			perPage: pagination.perPage ?? 20,
		})
		return { items: result.items.map(presentOrder), total: result.total }
	}

	@Get('/:orderId')
	async get(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@UuidParam('orderId') orderId: string,
	) {
		const store = await this.requireStore(storeSlug)
		const storeCustomer = await this.provisionMyStoreCustomer(request, store)

		const order = await this.getOrderUseCase.execute(orderId, store.id)
		// A guest walk-in order has no storeCustomerId at all, so it can never
		// match here — it 404s the same as any other customer's order, which is
		// exactly right: guest orders aren't reachable from self-service.
		if (order.storeCustomerId?.toString() !== storeCustomer.id.toString()) {
			throw new NotFoundException('Order not found.') // never 403 — don't confirm existence
		}
		return presentOrder(order)
	}

	private async requireStore(storeSlug: string): Promise<StoreSummary> {
		const store = await this.storesRepository.findBySlug(storeSlug)
		if (!store) {
			throw new NotFoundException('Store not found.')
		}
		return store
	}

	private async provisionMyStoreCustomer(
		request: { user?: { id?: string; name?: string; email?: string } },
		store: StoreSummary,
	): Promise<StoreCustomer> {
		const customerProfileId = request.user?.id
		if (!customerProfileId || !request.user?.email || !request.user?.name) {
			throw new NotFoundException('Store not found.')
		}

		return this.getOrCreateStoreCustomerUseCase.execute(store.id, customerProfileId, {
			email: request.user.email,
			name: request.user.name,
		})
	}
}
