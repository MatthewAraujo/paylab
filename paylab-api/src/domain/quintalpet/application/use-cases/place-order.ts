import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { StoreShippingSettingsRepository } from '@/domain/quintalpet/application/repositories/store-shipping-settings-repository'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { Order, OrderShippingAddressSnapshot } from '@/domain/quintalpet/enterprise/entities/order'
import { OrderItem } from '@/domain/quintalpet/enterprise/entities/order-item'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { InvalidDeliveryOptionError } from '@/domain/quintalpet/enterprise/errors/invalid-delivery-option-error'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'
import { calculateDeliveryFee } from '@/domain/quintalpet/enterprise/services/calculate-delivery-fee'
import { generateOrderCode } from '@/domain/quintalpet/enterprise/services/generate-order-code'
import { resolveDeliveryOption } from '@/domain/quintalpet/enterprise/services/resolve-delivery-option'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { OrderItemUnavailableError } from './errors/order-item-unavailable-error'
import { OrderPlacementConflictError } from './errors/order-placement-conflict-error'
import { QuotePromotionsUseCase } from './quote-promotions'
import { ResolveCepDistanceService } from './resolve-cep-distance'

export interface PlaceOrderItemInput {
	variantId: string
	quantity: number
}

export interface PlaceOrderInput {
	addressId: string
	deliveryOptionId: string
	paymentMethod: OrderPaymentMethod
	items: PlaceOrderItemInput[]
	/** Optional storefront coupon. Only a matching COUPON promotion applies it. */
	couponCode?: string | null
}

interface ResolvedVariant {
	productId: string
	productName: string
	variantId: string
	variantLabel: string
	sku: string
	unitPriceCents: number
	quantity: number
}

function presentAddressSnapshot(address: StoreCustomerAddress): OrderShippingAddressSnapshot {
	return {
		street: address.street,
		number: address.number,
		complement: address.complement,
		neighborhood: address.neighborhood,
		city: address.city,
		state: address.state,
		postalCode: address.postalCode,
	}
}

@Injectable()
export class PlaceOrderUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly ordersRepository: OrdersRepository,
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly inventoryItemsRepository: InventoryItemsRepository,
		private readonly shippingSettingsRepository: StoreShippingSettingsRepository,
		private readonly resolveCepDistance: ResolveCepDistanceService,
		private readonly quotePromotions: QuotePromotionsUseCase,
	) {}

	async execute(
		storeId: string,
		storeSlug: string,
		storeCustomerId: string,
		input: PlaceOrderInput,
	): Promise<Order> {
		const storeCustomer = await this.storeCustomersRepository.findById(storeCustomerId, storeId)
		if (!storeCustomer) throw new NotFoundException('Store customer not found.')

		// Only the option id is client input; the fee/label it resolves to here
		// is the only source of truth for what the order is actually charged.
		// shippingCents/deliveryLabel from the client are never trusted.
		const deliveryOption = resolveDeliveryOption(input.deliveryOptionId)
		if (!deliveryOption) throw new InvalidDeliveryOptionError()

		const address = storeCustomer.addresses.find((item) => item.id.toString() === input.addressId)
		if (!address) throw new StoreCustomerAddressNotFoundError()

		const orderId = new UniqueEntityID()

		// Merge duplicate variant lines so the OrderItem rows line up 1:1 with the
		// promotion engine's per-variant lines.
		const mergedQuantities = new Map<string, number>()
		for (const item of input.items) {
			mergedQuantities.set(
				item.variantId,
				(mergedQuantities.get(item.variantId) ?? 0) + item.quantity,
			)
		}
		const resolvedVariants = await Promise.all(
			[...mergedQuantities.entries()].map(([variantId, quantity]) =>
				this.resolveVariant(storeId, { variantId, quantity }),
			),
		)

		// Resolve the shipping fee BEFORE opening the placement transaction, so a
		// slow/failing geocoder never holds a DB transaction open. A geocoder
		// failure throws here, before any write.
		const shippingBaseCents = await this.resolveShippingCents(
			storeId,
			input.deliveryOptionId,
			address.postalCode,
		)

		// Server-owned promotion recompute — same engine as the storefront quote.
		// Any client-computed discount/total is ignored, exactly like the shipping
		// fee (ADR 0011).
		const quote = await this.quotePromotions.executeForStoreId(storeId, {
			items: resolvedVariants.map((variant) => ({
				variantId: variant.variantId,
				quantity: variant.quantity,
			})),
			channel: PromotionChannel.ECOMMERCE,
			couponCode: input.couponCode ?? null,
			deliveryOptionId: input.deliveryOptionId,
			shippingBaseCents,
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
				storeCustomerId: new UniqueEntityID(storeCustomerId),
				orderCode,
				items,
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
				shippingAddress: presentAddressSnapshot(address),
				deliveryLabel: deliveryOption.label,
				paymentMethod: input.paymentMethod,
			},
			orderId,
		)

		await this.runPlacementTransaction(order, storeCustomer)

		return order
	}

	/**
	 * `pickup-store` is always free and geocoding-free. `local-shipping` is
	 * recomputed from the store's origin CEP, the address CEP, and the store's
	 * settings — the client shouldn't have offered it if the store is
	 * unconfigured or the address is beyond `maxDistanceKm`, so both reject with
	 * `InvalidDeliveryOptionError`. A bad CEP throws `InvalidPostalCodeError`; a
	 * geocoder outage throws `GeocoderUnavailableError` (both from the distance
	 * service, surfaced by the controller as 400 / 503).
	 */
	private async resolveShippingCents(
		storeId: string,
		deliveryOptionId: string,
		addressPostalCode: string,
	): Promise<number> {
		if (deliveryOptionId === 'pickup-store') {
			return 0
		}

		const settings = await this.shippingSettingsRepository.findByStoreId(storeId)
		if (!settings) throw new InvalidDeliveryOptionError()

		const distanceKm = await this.resolveCepDistance.resolveDistanceKm(
			settings.originPostalCode,
			addressPostalCode,
		)
		const fee = calculateDeliveryFee({ distanceKm, settings })
		if (!fee.available) throw new InvalidDeliveryOptionError()

		return fee.feeCents
	}

	private async resolveVariant(
		storeId: string,
		input: PlaceOrderItemInput,
	): Promise<ResolvedVariant> {
		const variant = await this.prisma.productVariant.findFirst({
			where: { id: input.variantId, storeId, status: 'ACTIVE' },
			include: { product: { select: { id: true, name: true } } },
		})
		if (!variant) throw new OrderItemUnavailableError(input.variantId)

		return {
			productId: variant.product.id,
			productName: variant.product.name,
			variantId: variant.id,
			variantLabel: variant.name,
			sku: variant.sku,
			unitPriceCents: variant.priceCents,
			quantity: input.quantity,
		}
	}

	private async runPlacementTransaction(
		order: Order,
		storeCustomer: StoreCustomer,
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

					storeCustomer.registerOrder(order.totalCents)
					await this.storeCustomersRepository.save(storeCustomer, tx)
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
