import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { Order, OrderShippingAddressSnapshot } from '@/domain/quintalpet/enterprise/entities/order'
import { OrderItem } from '@/domain/quintalpet/enterprise/entities/order-item'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { generateOrderCode } from '@/domain/quintalpet/enterprise/services/generate-order-code'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { OrderItemUnavailableError } from './errors/order-item-unavailable-error'
import { OrderPlacementConflictError } from './errors/order-placement-conflict-error'
import { QuotePromotionsUseCase } from './quote-promotions'

export interface WalkInOrderItemInput {
	variantId: string
	quantity: number
}

/**
 * Accepts either an existing store customer (`storeCustomerId`) or a guest
 * identity (`guestName` + `guestPhone`) for a walk-in customer with no
 * registered account — exactly one of the two must be provided. `Order.create()`
 * enforces that invariant; this use case only decides how the order's customer
 * identity gets resolved before the shared line-item/inventory/transaction
 * logic below runs, unchanged, for either path.
 */
export interface CreateWalkInOrderInput {
	items: WalkInOrderItemInput[]
	paymentMethod: OrderPaymentMethod
	storeCustomerId?: string
	guestName?: string
	guestPhone?: string
}

interface ResolvedWalkInVariant {
	productId: string
	productName: string
	variantId: string
	variantLabel: string
	sku: string
	unitPriceCents: number
	quantity: number
}

const WALK_IN_SHIPPING_ADDRESS_SNAPSHOT: OrderShippingAddressSnapshot = {
	street: 'Retirada no local',
	number: 'S/N',
	neighborhood: 'Balcão da loja',
	city: '-',
	state: '-',
	postalCode: '00000-000',
}

@Injectable()
export class CreateWalkInOrderUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly ordersRepository: OrdersRepository,
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly inventoryItemsRepository: InventoryItemsRepository,
		private readonly quotePromotions: QuotePromotionsUseCase,
	) {}

	async execute(storeId: string, storeSlug: string, input: CreateWalkInOrderInput): Promise<Order> {
		const storeCustomer = input.storeCustomerId
			? await this.storeCustomersRepository.findById(input.storeCustomerId, storeId)
			: null
		if (input.storeCustomerId && !storeCustomer) {
			throw new NotFoundException('Store customer not found.')
		}

		const orderId = new UniqueEntityID()

		// Merge duplicate variant lines first, so the OrderItem rows line up 1:1
		// with the promotion engine's per-variant lines.
		const mergedQuantities = new Map<string, number>()
		for (const item of input.items) {
			mergedQuantities.set(
				item.variantId,
				(mergedQuantities.get(item.variantId) ?? 0) + item.quantity,
			)
		}
		const resolvedVariants = await Promise.all(
			[...mergedQuantities.entries()].map(([variantId, quantity]) =>
				this.resolveVariant(storeId, variantId, quantity),
			),
		)

		// Server-owned promotion recompute — the SAME engine the storefront and
		// self-service order placement use, on the PDV channel. The engine forces
		// `shippingBaseCents = 0` and no-ops shipping discounts for PDV, so a
		// walk-in sale never gains freight semantics (ADR 0011). PDV has no
		// coupon-entry surface in the MVP, so no coupon is threaded here.
		const quote = await this.quotePromotions.executeForStoreId(storeId, {
			items: resolvedVariants.map((variant) => ({
				variantId: variant.variantId,
				quantity: variant.quantity,
			})),
			channel: PromotionChannel.PDV,
			couponCode: null,
			shippingBaseCents: 0,
		})

		const lineDiscountByVariant = new Map(
			quote.lineDiscounts.map((entry) => [entry.variantId, entry.discountCents]),
		)
		const items = resolvedVariants.map((variant) => {
			const lineDiscountCents = lineDiscountByVariant.get(variant.variantId) ?? 0
			const baseLineTotalCents = variant.unitPriceCents * variant.quantity
			const netLineTotalCents = baseLineTotalCents - lineDiscountCents
			const netUnitPriceCents =
				variant.quantity > 0
					? Math.round(netLineTotalCents / variant.quantity)
					: variant.unitPriceCents
			return OrderItem.create({
				orderId,
				productId: new UniqueEntityID(variant.productId),
				variantId: new UniqueEntityID(variant.variantId),
				productName: variant.productName,
				variantLabel: variant.variantLabel,
				sku: variant.sku,
				quantity: variant.quantity,
				unitPriceCents: netUnitPriceCents,
				baseUnitPriceCents: variant.unitPriceCents,
				baseLineTotalCents,
				lineDiscountCents,
				lineTotalCents: netLineTotalCents,
			})
		})

		const orderCode = await this.generateUniqueOrderCode(storeSlug)
		const order = Order.create(
			{
				storeId: new UniqueEntityID(storeId),
				storeCustomerId: storeCustomer ? storeCustomer.id : null,
				guestName: input.guestName,
				guestPhone: input.guestPhone,
				orderCode,
				items,
				// Picked up in person, on the spot: no shipping, and the sale is
				// already complete — not "processing" toward a future fulfillment step.
				status: OrderStatus.DELIVERED,
				shippingCents: quote.shippingCents,
				baseSubtotalCents: quote.baseSubtotalCents,
				itemDiscountTotalCents: quote.itemDiscountCents,
				shippingBaseCents: quote.shippingBaseCents,
				shippingDiscountCents: quote.shippingDiscountCents,
				totalDiscountCents: quote.totalDiscountCents,
				appliedPromotions: quote.appliedPromotions.map((promotion) => ({
					id: promotion.id,
					name: promotion.name,
					benefitType: promotion.benefitType,
					targetScope: promotion.targetScope,
					discountCents: promotion.discountCents,
					couponCode: promotion.couponCode,
				})),
				shippingAddress: WALK_IN_SHIPPING_ADDRESS_SNAPSHOT,
				deliveryLabel: 'Retirada no local',
				paymentMethod: input.paymentMethod,
			},
			orderId,
		)

		await this.runPlacementTransaction(order, storeCustomer)

		return order
	}

	// Duplicated from PlaceOrderUseCase rather than imported from it: the walk-in
	// order is a sibling use case with a different trigger/auth context (operator-
	// initiated, not customer-initiated), not a wrapper around the self-service one.
	// See T6 / the Orders phase T4 for the shared transaction/retry precedent.
	private async resolveVariant(
		storeId: string,
		variantId: string,
		quantity: number,
	): Promise<ResolvedWalkInVariant> {
		const variant = await this.prisma.productVariant.findFirst({
			where: { id: variantId, storeId, status: 'ACTIVE' },
			include: { product: { select: { id: true, name: true } } },
		})
		if (!variant) throw new OrderItemUnavailableError(variantId)

		return {
			productId: variant.product.id,
			productName: variant.product.name,
			variantId: variant.id,
			variantLabel: variant.name,
			sku: variant.sku,
			unitPriceCents: variant.priceCents,
			quantity,
		}
	}

	private async runPlacementTransaction(
		order: Order,
		storeCustomer: StoreCustomer | null,
		attempt = 1,
	): Promise<void> {
		try {
			await this.prisma.$transaction(
				async (tx) => {
					await this.ordersRepository.save(order, tx)

					for (const item of order.items) {
						const inventoryItem =
							(await this.inventoryItemsRepository.findByVariantId(
								item.variantId.toString(),
								order.storeId.toString(),
							)) ?? InventoryItem.create({ storeId: order.storeId, variantId: item.variantId })
						try {
							const movement = inventoryItem.remove(item.quantity, `Order ${order.orderCode}`)
							await this.inventoryItemsRepository.save(inventoryItem, movement, tx)
						} catch (error) {
							if (error instanceof NegativeInventoryBalanceError) {
								throw new OrderItemUnavailableError(item.variantId.toString())
							}
							throw error
						}
					}

					if (storeCustomer) {
						storeCustomer.registerOrder(order.totalCents)
						await this.storeCustomersRepository.save(storeCustomer, tx)
					}
				},
				{ isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
			)
		} catch (error) {
			if (this.isSerializationFailure(error) && attempt < 3) {
				return this.runPlacementTransaction(order, storeCustomer, attempt + 1)
			}
			if (this.isSerializationFailure(error)) {
				throw new OrderPlacementConflictError()
			}
			throw error
		}
	}

	private isSerializationFailure(error: unknown): boolean {
		// Postgres serialization_failure surfaces through Prisma as P2034.
		return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034'
	}

	private async generateUniqueOrderCode(storeSlug: string, attempt = 1): Promise<string> {
		const code = generateOrderCode(storeSlug)
		const collision = await this.prisma.order.findUnique({ where: { orderCode: code } })
		if (collision && attempt < 3) return this.generateUniqueOrderCode(storeSlug, attempt + 1)
		if (collision) throw new OrderPlacementConflictError()
		return code
	}
}
