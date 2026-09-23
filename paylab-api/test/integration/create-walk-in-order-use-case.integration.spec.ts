import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { CreateWalkInOrderUseCase } from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { OrderItemUnavailableError } from '@/domain/quintalpet/application/use-cases/errors/order-item-unavailable-error'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { InvalidOrderCustomerIdentityError } from '@/domain/quintalpet/enterprise/errors/invalid-order-customer-identity-error'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaStoreCustomersRepository } from '@/infra/database/prisma/repositories/customers/prisma-store-customers-repository'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'
import { PrismaOrdersRepository } from '@/infra/database/prisma/repositories/orders/prisma-orders-repository'
import { PrismaPromotionsRepository } from '@/infra/database/prisma/repositories/promotions/prisma-promotions-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const ordersRepository: OrdersRepository = new PrismaOrdersRepository(prisma)
const storeCustomersRepository: StoreCustomersRepository = new PrismaStoreCustomersRepository(
	prisma,
)
const inventoryItemsRepository: InventoryItemsRepository = new PrismaInventoryItemsRepository(
	prisma,
)
const quotePromotionsUseCase = new QuotePromotionsUseCase(
	prisma,
	new PrismaPromotionsRepository(prisma),
	new PrismaCatalogCategoriesRepository(prisma),
)
const createWalkInOrderUseCase = new CreateWalkInOrderUseCase(
	prisma,
	ordersRepository,
	storeCustomersRepository,
	inventoryItemsRepository,
	quotePromotionsUseCase,
)

async function resetDatabase() {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.storeShippingSettings.deleteMany()
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

async function seedStoreWithVariant(suffix: string, priceCents = 5000) {
	const store = await prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` },
	})
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

async function seedCustomer(storeId: string, suffix: string) {
	const storeCustomer = StoreCustomer.create({
		storeId: new UniqueEntityID(storeId),
		customerProfileId: `customer-profile-${suffix}`,
		email: `cliente-${suffix}@example.com`,
		name: 'Cliente Balcao',
	})
	await storeCustomersRepository.save(storeCustomer)
	return storeCustomer
}

async function stockVariant(storeId: string, variantId: string, quantity: number) {
	const item = InventoryItem.create({
		storeId: new UniqueEntityID(storeId),
		variantId: new UniqueEntityID(variantId),
	})
	await inventoryItemsRepository.save(item, item.receive(quantity, 'seed stock'))
}

async function seedPromotion(
	storeId: string,
	data: {
		name: string
		channels: ('ECOMMERCE' | 'PDV')[]
		targetScope: 'ELIGIBLE_ITEMS' | 'ORDER_SUBTOTAL' | 'SHIPPING'
		conditions: unknown[]
		benefits: unknown[]
		priority?: number
	},
) {
	return prisma.promotion.create({
		data: {
			storeId,
			name: data.name,
			status: 'ACTIVE',
			visibility: 'PUBLIC',
			channels: data.channels,
			priority: data.priority ?? 10,
			isStackable: false,
			targetScope: data.targetScope,
			conditions: data.conditions as never,
			benefits: data.benefits as never,
		},
	})
}

describe('CreateWalkInOrderUseCase', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('records a counter sale for an existing store customer as a delivered order with an OUTBOUND movement', async () => {
		const { store, variant } = await seedStoreWithVariant('walkin-happy', 5000)
		await stockVariant(store.id, variant.id, 10)
		const storeCustomer = await seedCustomer(store.id, 'walkin-happy')

		const order = await createWalkInOrderUseCase.execute(store.id, store.slug, {
			storeCustomerId: storeCustomer.id.toString(),
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 3 }],
		})

		expect(order.orderCode).toBeTruthy()
		// A walk-in sale is picked up on the spot — it starts (and stays) DELIVERED,
		// not PROCESSING, so it never shows as pending fulfillment.
		expect(order.status).toBe(OrderStatus.DELIVERED)
		expect(order.shippingCents).toBe(0)
		expect(order.subtotalCents).toBe(15000)
		expect(order.totalCents).toBe(15000)
		expect(order.deliveryLabel).toBe('Retirada no local')

		const inventoryItem = await inventoryItemsRepository.findByVariantId(variant.id, store.id)
		expect(inventoryItem?.availableQuantity).toBe(7)
		const lastMovement = inventoryItem?.movements.at(-1)
		expect(lastMovement?.type).toBe('OUTBOUND')
		expect(lastMovement?.quantityDelta).toBe(-3)
		// Same referencing convention PlaceOrderUseCase uses for its movement note.
		expect(lastMovement?.note).toBe(`Order ${order.orderCode}`)

		const persistedCustomer = await prisma.storeCustomer.findUnique({
			where: { id: storeCustomer.id.toString() },
		})
		expect(persistedCustomer?.totalOrders).toBe(1)
		expect(persistedCustomer?.totalSpentCents).toBe(15000)
		expect(persistedCustomer?.lastOrderAt).not.toBeNull()
	})

	test('a walk-in order is never distance-priced, even when the store has shipping settings', async () => {
		const { store, variant } = await seedStoreWithVariant('walkin-shipping', 5000)
		await stockVariant(store.id, variant.id, 10)
		await prisma.storeShippingSettings.create({
			data: {
				storeId: store.id,
				originPostalCode: '02010000',
				baseCents: 4500,
				perKmCents: 300,
				maxDistanceKm: 20,
				freeShippingDistanceKm: 0,
			},
		})
		const storeCustomer = await seedCustomer(store.id, 'walkin-shipping')

		const order = await createWalkInOrderUseCase.execute(store.id, store.slug, {
			storeCustomerId: storeCustomer.id.toString(),
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 1 }],
		})

		expect(order.shippingCents).toBe(0)
		expect(order.totalCents).toBe(5000)
		expect(order.deliveryLabel).toBe('Retirada no local')
	})

	test('rejects the whole sale when one item has insufficient stock, leaving no Order/OrderItem/movement rows behind', async () => {
		const { store, variant: plentifulVariant } = await seedStoreWithVariant('walkin-short-a', 5000)
		const scarceProduct = await prisma.product.create({
			data: { storeId: store.id, name: 'Produto Escasso', slug: 'walkin-short-b' },
		})
		const scarceVariant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: scarceProduct.id,
				name: '1kg',
				sku: 'SKU-walkin-short-b',
				priceCents: 2000,
				status: 'ACTIVE',
			},
		})

		await stockVariant(store.id, plentifulVariant.id, 10)
		await stockVariant(store.id, scarceVariant.id, 1)

		const storeCustomer = await seedCustomer(store.id, 'walkin-short')

		await expect(
			createWalkInOrderUseCase.execute(store.id, store.slug, {
				storeCustomerId: storeCustomer.id.toString(),
				paymentMethod: OrderPaymentMethod.PIX,
				items: [
					{ variantId: plentifulVariant.id, quantity: 2 },
					{ variantId: scarceVariant.id, quantity: 5 },
				],
			}),
		).rejects.toThrow(OrderItemUnavailableError)

		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
		expect(await prisma.orderItem.count()).toBe(0)
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

	test('records a guest order (name + phone, no registered customer) as delivered, with inventory decremented the same way', async () => {
		const { store, variant } = await seedStoreWithVariant('walkin-guest', 5000)
		await stockVariant(store.id, variant.id, 10)

		const order = await createWalkInOrderUseCase.execute(store.id, store.slug, {
			guestName: 'Cliente Balcao',
			guestPhone: '11999998888',
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 3 }],
		})

		expect(order.status).toBe(OrderStatus.DELIVERED)
		expect(order.storeCustomerId).toBeNull()
		expect(order.guestName).toBe('Cliente Balcao')
		expect(order.guestPhone).toBe('11999998888')

		const persistedOrder = await prisma.order.findUnique({ where: { id: order.id.toString() } })
		expect(persistedOrder?.storeCustomerId).toBeNull()
		expect(persistedOrder?.guestName).toBe('Cliente Balcao')
		expect(persistedOrder?.guestPhone).toBe('11999998888')

		const inventoryItem = await inventoryItemsRepository.findByVariantId(variant.id, store.id)
		expect(inventoryItem?.availableQuantity).toBe(7)
		const lastMovement = inventoryItem?.movements.at(-1)
		expect(lastMovement?.type).toBe('OUTBOUND')
		expect(lastMovement?.quantityDelta).toBe(-3)
	})

	test('rejects a walk-in order with both a storeCustomerId and guest fields', async () => {
		const { store, variant } = await seedStoreWithVariant('walkin-both', 5000)
		await stockVariant(store.id, variant.id, 10)
		const storeCustomer = await seedCustomer(store.id, 'walkin-both')

		await expect(
			createWalkInOrderUseCase.execute(store.id, store.slug, {
				storeCustomerId: storeCustomer.id.toString(),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toThrow(InvalidOrderCustomerIdentityError)

		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('rejects a walk-in order with neither a storeCustomerId nor guest fields', async () => {
		const { store, variant } = await seedStoreWithVariant('walkin-neither', 5000)
		await stockVariant(store.id, variant.id, 10)

		await expect(
			createWalkInOrderUseCase.execute(store.id, store.slug, {
				paymentMethod: OrderPaymentMethod.PIX,
				items: [{ variantId: variant.id, quantity: 1 }],
			}),
		).rejects.toThrow(InvalidOrderCustomerIdentityError)

		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('applies a PDV-eligible promotion to a walk-in order and persists the commercial snapshot', async () => {
		const { store, product, variant } = await seedStoreWithVariant('walkin-promo', 5000)
		await stockVariant(store.id, variant.id, 10)
		const catalogProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
		await seedPromotion(store.id, {
			name: '10% no balcão',
			channels: ['PDV'],
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
		const storeCustomer = await seedCustomer(store.id, 'walkin-promo')

		const order = await createWalkInOrderUseCase.execute(store.id, store.slug, {
			storeCustomerId: storeCustomer.id.toString(),
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 2 }],
		})

		expect(order.baseSubtotalCents).toBe(10000)
		expect(order.itemDiscountTotalCents).toBe(1000)
		expect(order.subtotalCents).toBe(9000)
		expect(order.shippingCents).toBe(0)
		expect(order.shippingBaseCents).toBe(0)
		expect(order.shippingDiscountCents).toBe(0)
		expect(order.totalDiscountCents).toBe(1000)
		expect(order.totalCents).toBe(9000)
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

		const persistedCustomer = await prisma.storeCustomer.findUnique({
			where: { id: storeCustomer.id.toString() },
		})
		expect(persistedCustomer?.totalSpentCents).toBe(9000)
	})

	test('ignores an ecommerce-only promotion on a walk-in order', async () => {
		const { store, product, variant } = await seedStoreWithVariant('walkin-ecom-only', 5000)
		await stockVariant(store.id, variant.id, 10)
		const catalogProduct = await prisma.product.findUniqueOrThrow({ where: { id: product.id } })
		await seedPromotion(store.id, {
			name: '10% só no site',
			channels: ['ECOMMERCE'],
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

		const order = await createWalkInOrderUseCase.execute(store.id, store.slug, {
			guestName: 'Cliente Balcao',
			guestPhone: '11999998888',
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 2 }],
		})

		expect(order.baseSubtotalCents).toBe(10000)
		expect(order.itemDiscountTotalCents).toBe(0)
		expect(order.subtotalCents).toBe(10000)
		expect(order.totalCents).toBe(10000)
		expect(order.appliedPromotions).toHaveLength(0)
	})

	test('keeps shipping fields at zero on a walk-in order even with a PDV free-shipping promotion', async () => {
		const { store, variant } = await seedStoreWithVariant('walkin-free-ship', 5000)
		await stockVariant(store.id, variant.id, 10)
		await seedPromotion(store.id, {
			name: 'Frete grátis no balcão',
			channels: ['PDV'],
			targetScope: 'SHIPPING',
			conditions: [{ type: 'MIN_CART_VALUE', amountCents: 1 }],
			benefits: [{ type: 'FREE_SHIPPING' }],
		})

		const order = await createWalkInOrderUseCase.execute(store.id, store.slug, {
			guestName: 'Cliente Balcao',
			guestPhone: '11999998888',
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId: variant.id, quantity: 1 }],
		})

		expect(order.shippingBaseCents).toBe(0)
		expect(order.shippingDiscountCents).toBe(0)
		expect(order.shippingCents).toBe(0)
		expect(order.totalDiscountCents).toBe(0)
		expect(order.totalCents).toBe(5000)
	})
})
