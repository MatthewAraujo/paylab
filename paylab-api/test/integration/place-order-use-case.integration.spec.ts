import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { OrderItemUnavailableError } from '@/domain/quintalpet/application/use-cases/errors/order-item-unavailable-error'
import { OrderPlacementConflictError } from '@/domain/quintalpet/application/use-cases/errors/order-placement-conflict-error'
import { PlaceOrderUseCase } from '@/domain/quintalpet/application/use-cases/place-order'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { ResolveCepDistanceService } from '@/domain/quintalpet/application/use-cases/resolve-cep-distance'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { InvalidDeliveryOptionError } from '@/domain/quintalpet/enterprise/errors/invalid-delivery-option-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaStoreCustomersRepository } from '@/infra/database/prisma/repositories/customers/prisma-store-customers-repository'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'
import { PrismaOrdersRepository } from '@/infra/database/prisma/repositories/orders/prisma-orders-repository'
import { PrismaPromotionsRepository } from '@/infra/database/prisma/repositories/promotions/prisma-promotions-repository'
import { PrismaCepGeocodesRepository } from '@/infra/database/prisma/repositories/shipping/prisma-cep-geocodes-repository'
import { PrismaStoreShippingSettingsRepository } from '@/infra/database/prisma/repositories/shipping/prisma-store-shipping-settings-repository'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const ordersRepository: OrdersRepository = new PrismaOrdersRepository(prisma)
const storeCustomersRepository: StoreCustomersRepository = new PrismaStoreCustomersRepository(
	prisma,
)
const inventoryItemsRepository: InventoryItemsRepository = new PrismaInventoryItemsRepository(
	prisma,
)
const shippingSettingsRepository = new PrismaStoreShippingSettingsRepository(prisma)
const geocoder = new FakeCepGeocoder()
const resolveCepDistance = new ResolveCepDistanceService(
	geocoder,
	new PrismaCepGeocodesRepository(prisma),
)
const quotePromotionsUseCase = new QuotePromotionsUseCase(
	prisma,
	new PrismaPromotionsRepository(prisma),
	new PrismaCatalogCategoriesRepository(prisma),
)
const placeOrderUseCase = new PlaceOrderUseCase(
	prisma,
	ordersRepository,
	storeCustomersRepository,
	inventoryItemsRepository,
	shippingSettingsRepository,
	resolveCepDistance,
	quotePromotionsUseCase,
)

const ORIGIN_CEP = '02010-000'

// A configured store whose fee is a flat 990 within a wide radius: baseCents
// 990, perKmCents 0, so the fee is distance-independent as long as the address
// is in range — this keeps the pre-distance expectations (990 flat) valid.
async function configureFlatShipping(
	storeId: string,
	overrides: Partial<{
		baseCents: number
		perKmCents: number
		maxDistanceKm: number
		freeShippingDistanceKm: number
	}> = {},
) {
	await shippingSettingsRepository.upsert(
		StoreShippingSettings.create({
			storeId: new UniqueEntityID(storeId),
			originPostalCode: ORIGIN_CEP,
			baseCents: overrides.baseCents ?? 990,
			perKmCents: overrides.perKmCents ?? 0,
			maxDistanceKm: overrides.maxDistanceKm ?? 50,
			freeShippingDistanceKm: overrides.freeShippingDistanceKm ?? 0,
		}),
	)
}

async function resetDatabase() {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.attachment.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

async function seedStoreWithVariant(suffix: string, priceCents = 5000, configureShipping = true) {
	const store = await prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` },
	})
	if (configureShipping) {
		await configureFlatShipping(store.id)
	}
	const brand = await prisma.brand.create({
		data: { storeId: store.id, name: 'Marca', slug: `marca-${suffix}` },
	})
	const category = await prisma.category.create({
		data: { storeId: store.id, name: 'Categoria', slug: `categoria-${suffix}` },
	})
	const product = await prisma.product.create({
		data: {
			storeId: store.id,
			name: 'Racao Premium',
			slug: `produto-${suffix}`,
			brandId: brand.id,
			primaryCategoryId: category.id,
		},
	})
	const variant = await prisma.productVariant.create({
		data: {
			storeId: store.id,
			productId: product.id,
			name: '15kg',
			sku: `SKU-${suffix}`,
			priceCents,
			status: 'ACTIVE',
		},
	})
	return { store, product, variant }
}

async function seedCustomerWithAddress(storeId: string, suffix: string, postalCode = '02010-000') {
	const storeCustomer = StoreCustomer.create({
		storeId: new UniqueEntityID(storeId),
		customerProfileId: `customer-profile-${suffix}`,
		email: `cliente-${suffix}@example.com`,
		name: 'Cliente Teste',
	})
	const address = StoreCustomerAddress.create({
		storeCustomerId: storeCustomer.id,
		street: 'Rua das Flores',
		number: '123',
		neighborhood: 'Centro',
		city: 'Sao Paulo',
		state: 'SP',
		postalCode,
		isDefault: true,
	})
	storeCustomer.addAddress(address)
	await storeCustomersRepository.save(storeCustomer)
	return { storeCustomer, address }
}

async function addVariantToStore(
	storeId: string,
	brandId: string,
	categoryId: string,
	suffix: string,
	priceCents: number,
) {
	const product = await prisma.product.create({
		data: {
			storeId,
			name: `Produto ${suffix}`,
			slug: `produto-${suffix}`,
			brandId,
			primaryCategoryId: categoryId,
		},
	})
	return prisma.productVariant.create({
		data: {
			storeId,
			productId: product.id,
			name: '1kg',
			sku: `SKU-${suffix}`,
			priceCents,
			status: 'ACTIVE',
		},
	})
}

async function stockVariant(storeId: string, variantId: string, quantity: number) {
	const item = InventoryItem.create({
		storeId: new UniqueEntityID(storeId),
		variantId: new UniqueEntityID(variantId),
	})
	await inventoryItemsRepository.save(item, item.receive(quantity, 'seed stock'))
}

describe('PlaceOrderUseCase', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
		geocoder.reset()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('places an order, decrements stock via an OUTBOUND movement, and updates the customer purchase metrics', async () => {
		const { store, variant } = await seedStoreWithVariant('happy', 5000)
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'happy')

		const order = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 3 }],
			},
		)

		expect(order.orderCode).toBeTruthy()
		expect(order.status).toBe(OrderStatus.PROCESSING)
		expect(order.subtotalCents).toBe(15000)
		expect(order.totalCents).toBe(15990)

		const inventoryItem = await inventoryItemsRepository.findByVariantId(variant.id, store.id)
		expect(inventoryItem?.availableQuantity).toBe(7)
		expect(inventoryItem?.movements.at(-1)?.type).toBe('OUTBOUND')
		expect(inventoryItem?.movements.at(-1)?.quantityDelta).toBe(-3)

		const persistedCustomer = await prisma.storeCustomer.findUnique({
			where: { id: storeCustomer.id.toString() },
		})
		expect(persistedCustomer?.totalOrders).toBe(1)
		expect(persistedCustomer?.totalSpentCents).toBe(15990)
		expect(persistedCustomer?.lastOrderAt).not.toBeNull()
	})

	test('pickup-store: shipping is free and the geocoder is never called', async () => {
		const { store, variant } = await seedStoreWithVariant('pickup', 5000)
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'pickup')

		const order = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'pickup-store',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			},
		)

		expect(order.shippingCents).toBe(0)
		expect(order.totalCents).toBe(5000)
		expect(geocoder.calls).toHaveLength(0)
	})

	test('local-shipping fee equals calculateDeliveryFee for the resolved distance', async () => {
		const { store, variant } = await seedStoreWithVariant('priced', 5000, false)
		await configureFlatShipping(store.id, { baseCents: 500, perKmCents: 100, maxDistanceKm: 40 })
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(
			store.id,
			'priced',
			'04570-000',
		)

		geocoder.setCoordinates(ORIGIN_CEP, -23.5, -46.6)
		geocoder.setCoordinates('04570-000', -23.5, -46.6) // same coords -> distance 0

		const order = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			},
		)

		// distance 0 -> base 500 + ceil(0) * 100 = 500
		expect(order.shippingCents).toBe(500)
		expect(order.totalCents).toBe(5500)
	})

	test('rejects local-shipping when the address is beyond the store maxDistanceKm', async () => {
		const { store, variant } = await seedStoreWithVariant('out-of-range', 5000, false)
		await configureFlatShipping(store.id, { maxDistanceKm: 1 })
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(
			store.id,
			'out-of-range',
			'04570-000',
		)

		geocoder.setCoordinates(ORIGIN_CEP, -23.5, -46.6)
		geocoder.setCoordinates('04570-000', -23.7, -46.9) // ~30 km away

		await expect(
			placeOrderUseCase.execute(store.id, store.slug, storeCustomer.id.toString(), {
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toBeInstanceOf(InvalidDeliveryOptionError)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('rejects local-shipping when the store has no shipping settings configured', async () => {
		const { store, variant } = await seedStoreWithVariant('unconfigured', 5000, false)
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'unconfigured')

		await expect(
			placeOrderUseCase.execute(store.id, store.slug, storeCustomer.id.toString(), {
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toBeInstanceOf(InvalidDeliveryOptionError)
	})

	test('rejects local-shipping when the address CEP cannot be geocoded (not found)', async () => {
		const { store, variant } = await seedStoreWithVariant('cep-notfound', 5000)
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(
			store.id,
			'cep-notfound',
			'99999-999',
		)
		geocoder.setNotFound('99999-999')

		await expect(
			placeOrderUseCase.execute(store.id, store.slug, storeCustomer.id.toString(), {
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toBeInstanceOf(InvalidPostalCodeError)
	})

	test('a geocoder outage surfaces as a transient failure and persists no order', async () => {
		const { store, variant } = await seedStoreWithVariant('geo-down', 5000)
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'geo-down')
		geocoder.setUnavailable('02010-000')

		await expect(
			placeOrderUseCase.execute(store.id, store.slug, storeCustomer.id.toString(), {
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toBeInstanceOf(GeocoderUnavailableError)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('an address within the free-shipping radius: fee 0 but the order is still placed', async () => {
		const { store, variant } = await seedStoreWithVariant('free-ship', 5000, false)
		// default fake geocoder -> distance 0, so any non-zero free radius covers it
		await configureFlatShipping(store.id, { baseCents: 990, freeShippingDistanceKm: 3 })
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'free-ship')

		const order = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 2 }],
			},
		)

		expect(order.shippingCents).toBe(0)
		expect(order.totalCents).toBe(10000)
	})

	test('rejects the whole order when one item has insufficient stock, leaving no Order/OrderItem/movement rows behind', async () => {
		const {
			store,
			product,
			variant: plentifulVariant,
		} = await seedStoreWithVariant('short-a', 5000)
		const catalogProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
		const scarceVariant = await addVariantToStore(
			store.id,
			catalogProduct.brandId as string,
			catalogProduct.primaryCategoryId as string,
			'short-b',
			2000,
		)

		await stockVariant(store.id, plentifulVariant.id, 10)
		await stockVariant(store.id, scarceVariant.id, 1)

		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'short')

		await expect(
			placeOrderUseCase.execute(store.id, store.slug, storeCustomer.id.toString(), {
				addressId: address.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [
					{ variantId: plentifulVariant.id, quantity: 2 },
					{ variantId: scarceVariant.id, quantity: 5 },
				],
			}),
		).rejects.toThrow(OrderItemUnavailableError)

		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
		expect(await prisma.orderItem.count()).toBe(0)
		// seeding stock via stockVariant() above already created two INBOUND movements;
		// what matters here is that placement produced no OUTBOUND movement for either item.
		expect(
			await prisma.inventoryMovement.count({ where: { storeId: store.id, type: 'OUTBOUND' } }),
		).toBe(0)

		const plentifulItem = await inventoryItemsRepository.findByVariantId(
			plentifulVariant.id,
			store.id,
		)
		expect(plentifulItem?.availableQuantity).toBe(10)

		const persistedCustomer = await prisma.storeCustomer.findUnique({
			where: { id: storeCustomer.id.toString() },
		})
		expect(persistedCustomer?.totalOrders).toBe(0)
	})

	test('rejects placement against an address belonging to a different StoreCustomer, and decrements nothing', async () => {
		const { store, variant } = await seedStoreWithVariant('foreign-addr', 5000)
		await stockVariant(store.id, variant.id, 10)
		const { storeCustomer } = await seedCustomerWithAddress(store.id, 'foreign-addr-owner')
		const { address: foreignAddress } = await seedCustomerWithAddress(
			store.id,
			'foreign-addr-stranger',
		)

		await expect(
			placeOrderUseCase.execute(store.id, store.slug, storeCustomer.id.toString(), {
				addressId: foreignAddress.id.toString(),
				deliveryOptionId: 'local-shipping',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toThrow(StoreCustomerAddressNotFoundError)

		const inventoryItem = await inventoryItemsRepository.findByVariantId(variant.id, store.id)
		expect(inventoryItem?.availableQuantity).toBe(10)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	async function seedPromotion(
		storeId: string,
		data: {
			name: string
			targetScope: 'ELIGIBLE_ITEMS' | 'ORDER_SUBTOTAL' | 'SHIPPING'
			conditions: unknown[]
			benefits: unknown[]
			priority?: number
			visibility?: 'PUBLIC' | 'PRIVATE'
		},
	) {
		return prisma.promotion.create({
			data: {
				storeId,
				name: data.name,
				status: 'ACTIVE',
				visibility: data.visibility ?? 'PUBLIC',
				channels: ['ECOMMERCE'],
				priority: data.priority ?? 10,
				isStackable: false,
				targetScope: data.targetScope,
				conditions: data.conditions as never,
				benefits: data.benefits as never,
			},
		})
	}

	test('recomputes item discounts server-side and persists the full commercial snapshot', async () => {
		const { store, product, variant } = await seedStoreWithVariant('promo-item', 5000)
		await stockVariant(store.id, variant.id, 10)
		const catalogProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
		await seedPromotion(store.id, {
			name: '10% na categoria',
			targetScope: 'ELIGIBLE_ITEMS',
			conditions: [
				{
					type: 'CATEGORY',
					categoryId: catalogProduct.primaryCategoryId,
					includeDescendants: true,
				},
			],
			benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
		})
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'promo-item')

		const order = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'pickup-store',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 2 }],
			},
		)

		expect(order.baseSubtotalCents).toBe(10000)
		expect(order.itemDiscountTotalCents).toBe(1000)
		expect(order.subtotalCents).toBe(9000)
		expect(order.shippingCents).toBe(0)
		expect(order.totalCents).toBe(9000)
		expect(order.totalDiscountCents).toBe(1000)
		expect(order.appliedPromotions).toHaveLength(1)

		const persisted = await prisma.order.findUniqueOrThrow({
			where: { id: order.id.toString() },
			include: { items: true },
		})
		expect(persisted).toMatchObject({
			baseSubtotalCents: 10000,
			itemDiscountTotalCents: 1000,
			subtotalCents: 9000,
			shippingBaseCents: 0,
			shippingDiscountCents: 0,
			totalDiscountCents: 1000,
		})
		expect(persisted.appliedPromotions).toHaveLength(1)
		expect(persisted.items[0]).toMatchObject({
			baseUnitPriceCents: 5000,
			baseLineTotalCents: 10000,
			lineDiscountCents: 1000,
			unitPriceCents: 4500,
			lineTotalCents: 9000,
		})
	})

	test('a coupon-only promotion applies only when a valid couponCode is supplied', async () => {
		const { store, variant } = await seedStoreWithVariant('promo-coupon', 5000)
		await stockVariant(store.id, variant.id, 10)
		await seedPromotion(store.id, {
			name: 'Cupom SAVE10',
			targetScope: 'ORDER_SUBTOTAL',
			visibility: 'PRIVATE',
			conditions: [{ type: 'COUPON', code: 'SAVE10' }],
			benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
		})
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'promo-coupon')

		const withoutCoupon = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'pickup-store',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 2 }],
			},
		)
		expect(withoutCoupon.itemDiscountTotalCents).toBe(0)
		expect(withoutCoupon.appliedPromotions).toHaveLength(0)

		const withCoupon = await placeOrderUseCase.execute(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			{
				addressId: address.id.toString(),
				deliveryOptionId: 'pickup-store',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 2 }],
				couponCode: 'save10',
			},
		)
		expect(withCoupon.itemDiscountTotalCents).toBe(1000)
		expect(withCoupon.subtotalCents).toBe(9000)
		expect(withCoupon.appliedPromotions[0]).toMatchObject({
			couponCode: 'SAVE10',
			targetScope: 'ORDER_SUBTOTAL',
		})
	})

	test('two concurrent placements against stock for exactly one unit resolve to one success and one clean rejection, never a negative balance', async () => {
		const { store, variant } = await seedStoreWithVariant('race', 5000)
		await stockVariant(store.id, variant.id, 1)
		const { storeCustomer: customerA, address: addressA } = await seedCustomerWithAddress(
			store.id,
			'race-a',
		)
		const { storeCustomer: customerB, address: addressB } = await seedCustomerWithAddress(
			store.id,
			'race-b',
		)

		const placeA = placeOrderUseCase.execute(store.id, store.slug, customerA.id.toString(), {
			addressId: addressA.id.toString(),
			deliveryOptionId: 'local-shipping',
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 1 }],
		})
		const placeB = placeOrderUseCase.execute(store.id, store.slug, customerB.id.toString(), {
			addressId: addressB.id.toString(),
			deliveryOptionId: 'local-shipping',
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 1 }],
		})

		const results = await Promise.allSettled([placeA, placeB])

		const fulfilled = results.filter((result) => result.status === 'fulfilled')
		const rejected = results.filter((result) => result.status === 'rejected')

		expect(fulfilled).toHaveLength(1)
		expect(rejected).toHaveLength(1)

		const rejectionReason = (rejected[0] as PromiseRejectedResult).reason
		expect(
			rejectionReason instanceof OrderItemUnavailableError ||
				rejectionReason instanceof OrderPlacementConflictError,
		).toBe(true)

		const inventoryItem = await inventoryItemsRepository.findByVariantId(variant.id, store.id)
		expect(inventoryItem?.availableQuantity).toBe(0)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(1)
	})
})
