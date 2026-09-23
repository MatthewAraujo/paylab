import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Order } from '@/domain/quintalpet/enterprise/entities/order'
import { OrderItem } from '@/domain/quintalpet/enterprise/entities/order-item'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaOrdersRepository } from '@/infra/database/prisma/repositories/orders/prisma-orders-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const ordersRepository = new PrismaOrdersRepository(prisma)

async function resetDatabase() {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
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

async function createStoreAndCustomer(suffix: string) {
	const store = await prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` },
	})
	const storeCustomer = await prisma.storeCustomer.create({
		data: {
			storeId: store.id,
			customerProfileId: `customer-profile-${suffix}`,
			email: `cliente-${suffix}@example.com`,
		},
	})
	return { store, storeCustomer }
}

function orderData(overrides: {
	storeId: string
	storeCustomerId: string
	orderCode?: string
}): Parameters<typeof prisma.order.create>[0]['data'] {
	return {
		orderCode: `LOJA-${Math.random().toString(36).slice(2, 8)}`,
		subtotalCents: 10000,
		baseSubtotalCents: 10000,
		itemDiscountTotalCents: 0,
		shippingCents: 1000,
		shippingBaseCents: 1000,
		shippingDiscountCents: 0,
		totalDiscountCents: 0,
		totalCents: 11000,
		appliedPromotions: [],
		shippingAddress: { street: 'Rua A', number: '10' },
		deliveryLabel: 'Standard',
		paymentMethod: 'PIX',
		...overrides,
	}
}

function buildOrder(props: {
	id?: string
	storeId: string
	storeCustomerId: string
	orderCode?: string
	status?: OrderStatus
}) {
	const item = OrderItem.create({
		orderId: new UniqueEntityID(props.id),
		productId: new UniqueEntityID('product-1'),
		variantId: new UniqueEntityID('variant-1'),
		productName: 'Racao Premium',
		variantLabel: '15kg',
		sku: 'SKU-001',
		unitPriceCents: 5000,
		quantity: 2,
	})

	return Order.create(
		{
			storeId: new UniqueEntityID(props.storeId),
			storeCustomerId: new UniqueEntityID(props.storeCustomerId),
			orderCode: props.orderCode ?? `LOJA-${Math.random().toString(36).slice(2, 8)}`,
			status: props.status,
			items: [item],
			shippingCents: 1000,
			shippingAddress: {
				street: 'Rua das Flores',
				number: '123',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '01000-000',
			},
			deliveryLabel: 'Standard',
			paymentMethod: OrderPaymentMethod.PIX,
		},
		props.id ? new UniqueEntityID(props.id) : undefined,
	)
}

describe('Prisma orders schema invariants', () => {
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

	test('creating an Order with a non-existent storeCustomerId fails the FK constraint', async () => {
		const { store } = await createStoreAndCustomer('fk')

		await expect(
			prisma.order.create({
				data: orderData({
					storeId: store.id,
					storeCustomerId: 'non-existent-store-customer-id',
				}),
			}),
		).rejects.toMatchObject({ code: 'P2003' })
	})

	test('orderCode is unique — a duplicate orderCode throws a unique-constraint violation', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('code')

		await prisma.order.create({
			data: orderData({
				storeId: store.id,
				storeCustomerId: storeCustomer.id,
				orderCode: 'LOJA-DUPLICATE',
			}),
		})

		await expect(
			prisma.order.create({
				data: orderData({
					storeId: store.id,
					storeCustomerId: storeCustomer.id,
					orderCode: 'LOJA-DUPLICATE',
				}),
			}),
		).rejects.toMatchObject({ code: 'P2002' })
	})

	test('deleting a Store cascades and removes its Order and OrderItem rows', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('cascade')

		const order = await prisma.order.create({
			data: orderData({
				storeId: store.id,
				storeCustomerId: storeCustomer.id,
			}),
		})

		await prisma.orderItem.create({
			data: {
				orderId: order.id,
				productId: 'product-1',
				variantId: 'variant-1',
				productName: 'Racao Premium',
				variantLabel: '15kg',
				sku: 'SKU-001',
				unitPriceCents: 5000,
				baseUnitPriceCents: 5000,
				unitDiscountCents: 0,
				quantity: 2,
				lineTotalCents: 10000,
				baseLineTotalCents: 10000,
				lineDiscountCents: 0,
			},
		})

		await prisma.store.delete({ where: { id: store.id } })

		await expect(prisma.order.findUnique({ where: { id: order.id } })).resolves.toBeNull()
		await expect(prisma.orderItem.findMany({ where: { orderId: order.id } })).resolves.toHaveLength(
			0,
		)
	})

	test('deleting a StoreCustomer with orders is restricted rather than silently orphaning Order rows', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('restrict')

		await prisma.order.create({
			data: orderData({
				storeId: store.id,
				storeCustomerId: storeCustomer.id,
			}),
		})

		await expect(
			prisma.storeCustomer.delete({ where: { id: storeCustomer.id } }),
		).rejects.toMatchObject({ code: 'P2003' })
	})

	test('save() persists a brand-new Order with all of its OrderItem rows in one write', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('save')

		const order = buildOrder({ storeId: store.id, storeCustomerId: storeCustomer.id })

		await ordersRepository.save(order)

		const persistedOrder = await prisma.order.findUnique({ where: { id: order.id.toString() } })
		const persistedItems = await prisma.orderItem.findMany({
			where: { orderId: order.id.toString() },
		})

		expect(persistedOrder?.orderCode).toBe(order.orderCode)
		expect(persistedItems).toHaveLength(1)
		expect(persistedItems[0]).toMatchObject({
			productName: 'Racao Premium',
			sku: 'SKU-001',
			quantity: 2,
			lineTotalCents: 10000,
		})
	})

	test('findById returns the domain entity with items hydrated, and null for a different storeId', async () => {
		const { store: storeA, storeCustomer: customerA } = await createStoreAndCustomer('find-a')
		const { store: storeB } = await createStoreAndCustomer('find-b')

		const order = buildOrder({ storeId: storeA.id, storeCustomerId: customerA.id })
		await ordersRepository.save(order)

		const found = await ordersRepository.findById(order.id.toString(), storeA.id)
		expect(found).not.toBeNull()
		expect(found?.orderCode).toBe(order.orderCode)
		expect(found?.items).toHaveLength(1)
		expect(found?.items[0].productName).toBe('Racao Premium')

		const foreignLookup = await ordersRepository.findById(order.id.toString(), storeB.id)
		expect(foreignLookup).toBeNull()
	})

	test('listByStore filters by status and storeCustomerId, and never returns rows from another store', async () => {
		const { store: storeA, storeCustomer: customerA1 } = await createStoreAndCustomer('list-a1')
		const customerA2 = await prisma.storeCustomer.create({
			data: {
				storeId: storeA.id,
				customerProfileId: 'customer-profile-list-a2',
				email: 'cliente-list-a2@example.com',
			},
		})
		const { store: storeB, storeCustomer: customerB } = await createStoreAndCustomer('list-b')

		const orderA1 = buildOrder({ storeId: storeA.id, storeCustomerId: customerA1.id })
		const orderA2 = buildOrder({ storeId: storeA.id, storeCustomerId: customerA2.id })
		const orderB = buildOrder({ storeId: storeB.id, storeCustomerId: customerB.id })

		await ordersRepository.save(orderA1)
		await ordersRepository.save(orderA2)
		await ordersRepository.save(orderB)

		orderA2.transitionTo(OrderStatus.SHIPPED)
		await ordersRepository.save(orderA2)

		const allForStoreA = await ordersRepository.listByStore(storeA.id, { page: 1, perPage: 10 })
		expect(allForStoreA.total).toBe(2)
		expect(allForStoreA.items.map((item) => item.id.toString()).sort()).toEqual(
			[orderA1.id.toString(), orderA2.id.toString()].sort(),
		)

		const filteredByStatus = await ordersRepository.listByStore(storeA.id, {
			page: 1,
			perPage: 10,
			status: OrderStatus.SHIPPED,
		})
		expect(filteredByStatus.total).toBe(1)
		expect(filteredByStatus.items[0].id.toString()).toBe(orderA2.id.toString())

		const filteredByCustomer = await ordersRepository.listByStore(storeA.id, {
			page: 1,
			perPage: 10,
			storeCustomerId: customerA1.id,
		})
		expect(filteredByCustomer.total).toBe(1)
		expect(filteredByCustomer.items[0].id.toString()).toBe(orderA1.id.toString())
	})

	test('save() on an Order whose status changed updates status without duplicating OrderItem rows', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('update')

		const order = buildOrder({ storeId: store.id, storeCustomerId: storeCustomer.id })
		await ordersRepository.save(order)

		order.transitionTo(OrderStatus.READY_FOR_PICKUP)
		await ordersRepository.save(order)

		const persistedOrder = await prisma.order.findUnique({ where: { id: order.id.toString() } })
		const persistedItems = await prisma.orderItem.findMany({
			where: { orderId: order.id.toString() },
		})

		expect(persistedOrder?.status).toBe('READY_FOR_PICKUP')
		expect(persistedItems).toHaveLength(1)
	})

	test('an Order persists the richer commercial discount snapshot with per-line discount fields', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('snapshot')

		const order = await prisma.order.create({
			data: {
				...orderData({ storeId: store.id, storeCustomerId: storeCustomer.id }),
				subtotalCents: 8000,
				shippingCents: 0,
				totalCents: 8000,
				baseSubtotalCents: 10000,
				itemDiscountTotalCents: 2000,
				shippingBaseCents: 1500,
				shippingDiscountCents: 1500,
				totalDiscountCents: 3500,
				// Reconciled to the pricing engine's AppliedPromotion shape (T5):
				// { id, name, benefitType, targetScope, discountCents, couponCode }.
				appliedPromotions: [
					{
						id: 'promo-1',
						name: 'Leve 3 pague 2',
						benefitType: 'BUY_X_PAY_Y',
						targetScope: 'ELIGIBLE_ITEMS',
						discountCents: 2000,
						couponCode: null,
					},
					{
						id: 'promo-2',
						name: 'Frete grátis',
						benefitType: 'FREE_SHIPPING',
						targetScope: 'SHIPPING',
						discountCents: 1500,
						couponCode: null,
					},
				],
				items: {
					create: {
						productId: 'product-1',
						variantId: 'variant-1',
						productName: 'Racao Premium',
						variantLabel: '15kg',
						sku: 'SKU-001',
						unitPriceCents: 4000,
						quantity: 2,
						lineTotalCents: 8000,
						baseUnitPriceCents: 5000,
						unitDiscountCents: 1000,
						baseLineTotalCents: 10000,
						lineDiscountCents: 2000,
					},
				},
			},
		})

		const persisted = await prisma.order.findUnique({
			where: { id: order.id },
			include: { items: true },
		})

		expect(persisted).toMatchObject({
			subtotalCents: 8000,
			shippingCents: 0,
			totalCents: 8000,
			baseSubtotalCents: 10000,
			itemDiscountTotalCents: 2000,
			shippingBaseCents: 1500,
			shippingDiscountCents: 1500,
			totalDiscountCents: 3500,
		})
		expect(persisted?.appliedPromotions).toHaveLength(2)
		expect(persisted?.items[0]).toMatchObject({
			baseUnitPriceCents: 5000,
			unitDiscountCents: 1000,
			baseLineTotalCents: 10000,
			lineDiscountCents: 2000,
		})
	})

	test('existing order writes keep working — discount snapshot fields default to a no-promotion snapshot', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('snapshot-default')

		const order = await prisma.order.create({
			data: orderData({ storeId: store.id, storeCustomerId: storeCustomer.id }),
		})

		const persisted = await prisma.order.findUnique({ where: { id: order.id } })

		expect(persisted?.itemDiscountTotalCents).toBe(0)
		expect(persisted?.shippingDiscountCents).toBe(0)
		expect(persisted?.totalDiscountCents).toBe(0)
		expect(persisted?.appliedPromotions).toEqual([])
	})

	test('save() with an externally-supplied tx that is rolled back leaves no trace of the Order', async () => {
		const { store, storeCustomer } = await createStoreAndCustomer('rollback')

		const order = buildOrder({ storeId: store.id, storeCustomerId: storeCustomer.id })

		await expect(
			prisma.$transaction(async (tx) => {
				await ordersRepository.save(order, tx)
				throw new Error('force rollback')
			}),
		).rejects.toThrow('force rollback')

		const persistedOrder = await prisma.order.findUnique({ where: { id: order.id.toString() } })
		const persistedItems = await prisma.orderItem.findMany({
			where: { orderId: order.id.toString() },
		})

		expect(persistedOrder).toBeNull()
		expect(persistedItems).toHaveLength(0)
	})
})
