import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CepGeocoder } from '@/domain/quintalpet/application/gateways/cep-geocoder'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { PlaceOrderUseCase } from '@/domain/quintalpet/application/use-cases/place-order'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function configureShipping(prisma: PrismaService, storeId: string) {
	await prisma.storeShippingSettings.upsert({
		where: { storeId },
		update: {},
		create: {
			storeId,
			originPostalCode: '02010000',
			baseCents: 990,
			perKmCents: 0,
			maxDistanceKm: 50,
			freeShippingDistanceKm: 0,
		},
	})
}

async function resetDatabase(prisma: PrismaService) {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.cRMInteraction.deleteMany()
	await prisma.cRMProfile.deleteMany()
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
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

async function seedVariant(
	prisma: PrismaService,
	storeId: string,
	suffix: string,
	priceCents = 5000,
) {
	const brand = await prisma.brand.create({
		data: { storeId, name: 'Marca', slug: `marca-${suffix}` },
	})
	const category = await prisma.category.create({
		data: { storeId, name: 'Categoria', slug: `categoria-${suffix}` },
	})
	const product = await prisma.product.create({
		data: {
			storeId,
			name: 'Racao Premium',
			slug: `produto-${suffix}`,
			brandId: brand.id,
			primaryCategoryId: category.id,
		},
	})
	return prisma.productVariant.create({
		data: {
			storeId,
			productId: product.id,
			name: '15kg',
			sku: `SKU-${suffix}`,
			priceCents,
			status: 'ACTIVE',
		},
	})
}

async function stockVariant(
	prisma: PrismaService,
	storeId: string,
	variantId: string,
	quantity: number,
) {
	await prisma.inventoryItem.create({
		data: { storeId, variantId, availableQuantity: quantity },
	})
}

describe('Orders admin API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
	let placeOrderUseCase: PlaceOrderUseCase
	let storeCustomersRepository: StoreCustomersRepository
	const geocoder = new FakeCepGeocoder()

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(CepGeocoder)
			.useValue(geocoder)
			.compile()

		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)
		placeOrderUseCase = moduleRef.get(PlaceOrderUseCase)
		storeCustomersRepository = moduleRef.get(StoreCustomersRepository)

		await app.init()
	})

	beforeEach(async () => {
		await resetDatabase(prisma)
		geocoder.reset()
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	async function seedCustomerWithAddress(storeId: string, suffix: string) {
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
			postalCode: '02010-000',
			isDefault: true,
		})
		storeCustomer.addAddress(address)
		await storeCustomersRepository.save(storeCustomer)
		return { storeCustomer, address }
	}

	async function placeOrder(
		storeId: string,
		storeSlug: string,
		storeCustomerId: string,
		addressId: string,
		variantId: string,
		quantity = 1,
	) {
		await configureShipping(prisma, storeId)
		return placeOrderUseCase.execute(storeId, storeSlug, storeCustomerId, {
			addressId,
			deliveryOptionId: 'local-shipping',
			paymentMethod: OrderPaymentMethod.PIX,
			items: [{ variantId, quantity }],
		})
	}

	test('operator can list orders scoped to their own store; a different store member gets 403', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)

		const variant = await seedVariant(prisma, store.id, 'list')
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'list')
		await placeOrder(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			address.id.toString(),
			variant.id,
		)

		const response = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
		expect(response.statusCode).toBe(200)
		expect(response.body.total).toBe(1)

		const crossStoreResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', other.cookie)
		expect(crossStoreResponse.statusCode).toBe(403)
	})

	test('filters by status, storeCustomerId, and a created date range narrow results correctly', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'filter')
		await stockVariant(prisma, store.id, variant.id, 10)

		const { storeCustomer: customerA, address: addressA } = await seedCustomerWithAddress(
			store.id,
			'filter-a',
		)
		const { storeCustomer: customerB, address: addressB } = await seedCustomerWithAddress(
			store.id,
			'filter-b',
		)

		const orderA = await placeOrder(
			store.id,
			store.slug,
			customerA.id.toString(),
			addressA.id.toString(),
			variant.id,
		)
		await placeOrder(
			store.id,
			store.slug,
			customerB.id.toString(),
			addressB.id.toString(),
			variant.id,
		)

		await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${orderA.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'SHIPPED' })

		const byStatus = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders?status=SHIPPED`)
			.set('Cookie', cookie)
		expect(byStatus.body.total).toBe(1)
		expect(byStatus.body.items[0].id).toBe(orderA.id.toString())

		const byCustomer = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders?storeCustomerId=${customerB.id.toString()}`)
			.set('Cookie', cookie)
		expect(byCustomer.body.total).toBe(1)
		expect(byCustomer.body.items[0].id).not.toBe(orderA.id.toString())

		const farFuture = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString()
		const byDateRangeExcludingAll = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders?createdFrom=${farFuture}`)
			.set('Cookie', cookie)
		expect(byDateRangeExcludingAll.body.total).toBe(0)

		const byDateRangeIncludingAll = await request(app.getHttpServer())
			.get(
				`/api/v1/admin/stores/${store.id}/orders?createdFrom=${new Date(Date.now() - 60000).toISOString()}`,
			)
			.set('Cookie', cookie)
		expect(byDateRangeIncludingAll.body.total).toBe(2)
	})

	test('GET /:orderId returns full order detail', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'detail')
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'detail')
		const order = await placeOrder(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			address.id.toString(),
			variant.id,
			2,
		)

		const response = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders/${order.id.toString()}`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body.id).toBe(order.id.toString())
		expect(response.body.items).toHaveLength(1)
		expect(response.body.items[0].quantity).toBe(2)
	})

	test('PATCH /:orderId/status accepts a legal transition, rejects an illegal one, and rejects CANCELLED as a target', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'status')
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'status')
		const order = await placeOrder(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			address.id.toString(),
			variant.id,
		)

		const legalResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${order.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'SHIPPED' })
		expect(legalResponse.statusCode).toBe(200)
		expect(legalResponse.body.status).toBe('SHIPPED')

		const toDeliveredResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${order.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'DELIVERED' })
		expect(toDeliveredResponse.statusCode).toBe(200)

		// 'PROCESSING' is rejected by transitionStatusBodySchema (Zod) before
		// reaching the domain — not an InvalidOrderTransitionError scenario, so
		// this stays a plain 400 with no {code} assertion (see cancel tests below
		// for a real InvalidOrderTransitionError case going through order.transitionTo).
		const illegalResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${order.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'PROCESSING' })
		expect(illegalResponse.statusCode).toBe(400)

		const cancelledAsStatusResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${order.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'CANCELLED' })
		expect(cancelledAsStatusResponse.statusCode).toBe(400)
	})

	test('POST /:orderId/cancel on a PROCESSING order returns stock, records a RETURN movement, and reverses customer metrics', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'cancel')
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'cancel')
		const order = await placeOrder(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			address.id.toString(),
			variant.id,
			3,
		)

		const beforeCancelItem = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})
		expect(beforeCancelItem?.availableQuantity).toBe(7)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders/${order.id.toString()}/cancel`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body.status).toBe('CANCELLED')

		const afterCancelItem = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})
		expect(afterCancelItem?.availableQuantity).toBe(10)

		const returnMovement = await prisma.inventoryMovement.findFirst({
			where: { variantId: variant.id, type: 'RETURN' },
		})
		expect(returnMovement).not.toBeNull()
		expect(returnMovement?.quantityDelta).toBe(3)

		const persistedCustomer = await prisma.storeCustomer.findUnique({
			where: { id: storeCustomer.id.toString() },
		})
		expect(persistedCustomer?.totalOrders).toBe(0)
		expect(persistedCustomer?.totalSpentCents).toBe(0)
	})

	test('POST /:orderId/cancel on an already-DELIVERED or already-CANCELLED order returns 400 and changes nothing', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'terminal')
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer, address } = await seedCustomerWithAddress(store.id, 'terminal')
		const deliveredOrder = await placeOrder(
			store.id,
			store.slug,
			storeCustomer.id.toString(),
			address.id.toString(),
			variant.id,
		)

		await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${deliveredOrder.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'SHIPPED' })
		await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/orders/${deliveredOrder.id.toString()}/status`)
			.set('Cookie', cookie)
			.send({ status: 'DELIVERED' })

		const cancelDeliveredResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders/${deliveredOrder.id.toString()}/cancel`)
			.set('Cookie', cookie)
		expect(cancelDeliveredResponse.statusCode).toBe(400)
		expect(cancelDeliveredResponse.body.code).toBe('INVALID_ORDER_TRANSITION')
		expect(cancelDeliveredResponse.body.message).toBe('Transição de status do pedido inválida.')

		const { storeCustomer: customer2, address: address2 } = await seedCustomerWithAddress(
			store.id,
			'terminal-2',
		)
		const cancelledOrder = await placeOrder(
			store.id,
			store.slug,
			customer2.id.toString(),
			address2.id.toString(),
			variant.id,
		)
		await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders/${cancelledOrder.id.toString()}/cancel`)
			.set('Cookie', cookie)

		const inventoryItemAfterFirstCancel = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})

		const cancelAgainResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders/${cancelledOrder.id.toString()}/cancel`)
			.set('Cookie', cookie)
		expect(cancelAgainResponse.statusCode).toBe(400)

		const inventoryItemAfterSecondAttempt = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})
		expect(inventoryItemAfterSecondAttempt?.availableQuantity).toBe(
			inventoryItemAfterFirstCancel?.availableQuantity,
		)
	})

	test('operator can record a walk-in order for an existing store customer; it decrements stock and is immediately DELIVERED', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'walkin', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer } = await seedCustomerWithAddress(store.id, 'walkin')

		const response = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
			.send({
				storeCustomerId: storeCustomer.id.toString(),
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 2 }],
			})

		expect(response.statusCode).toBe(201)
		expect(response.body).toEqual(
			expect.objectContaining({
				status: 'DELIVERED',
				shippingCents: 0,
				subtotalCents: 10000,
				totalCents: 10000,
				deliveryLabel: 'Retirada no local',
				paymentMethod: 'PIX',
			}),
		)

		const inventoryItem = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})
		expect(inventoryItem?.availableQuantity).toBe(8)

		const lastMovement = await prisma.inventoryMovement.findFirst({
			where: { variantId: variant.id },
			orderBy: { createdAt: 'desc' },
		})
		expect(lastMovement?.type).toBe('OUTBOUND')
		expect(lastMovement?.note).toBe(`Order ${response.body.orderCode}`)

		const persistedCustomer = await prisma.storeCustomer.findUnique({
			where: { id: storeCustomer.id.toString() },
		})
		expect(persistedCustomer?.totalOrders).toBe(1)
		expect(persistedCustomer?.totalSpentCents).toBe(10000)

		// It shows up unmodified in the existing list/detail views.
		const listResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
		expect(listResponse.body.total).toBe(1)

		const detailResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders/${response.body.id}`)
			.set('Cookie', cookie)
		expect(detailResponse.statusCode).toBe(200)
		expect(detailResponse.body.id).toBe(response.body.id)

		// A walk-in sale is already complete — the standard cancel endpoint (built for
		// PROCESSING online orders) correctly refuses to touch a DELIVERED walk-in.
		const cancelResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders/${response.body.id}/cancel`)
			.set('Cookie', cookie)
		expect(cancelResponse.statusCode).toBe(400)
	})

	test('walk-in order creation rejects insufficient stock atomically and stays isolated from another store', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'walkin-short', 3000)
		await stockVariant(prisma, store.id, variant.id, 1)
		const { storeCustomer } = await seedCustomerWithAddress(store.id, 'walkin-short')

		const response = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
			.send({
				storeCustomerId: storeCustomer.id.toString(),
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 5 }],
			})

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('ORDER_ITEM_UNAVAILABLE')
		expect(response.body.message).toBe(
			'Não há quantidade suficiente em estoque para um dos itens do pedido.',
		)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)

		const inventoryItem = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})
		expect(inventoryItem?.availableQuantity).toBe(1)

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', other.cookie)
			.send({
				storeCustomerId: storeCustomer.id.toString(),
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})
		expect(crossStoreResponse.statusCode).toBe(403)
	})

	test('operator can record a walk-in order for a guest (name + phone, no registered account); it decrements stock and shows the guest identity in list/detail', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'walkin-guest', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
			.send({
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 2 }],
			})

		expect(response.statusCode).toBe(201)
		expect(response.body).toEqual(
			expect.objectContaining({
				status: 'DELIVERED',
				storeCustomerId: null,
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
			}),
		)

		const inventoryItem = await prisma.inventoryItem.findFirst({
			where: { variantId: variant.id },
		})
		expect(inventoryItem?.availableQuantity).toBe(8)

		const listResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
		expect(listResponse.body.total).toBe(1)
		expect(listResponse.body.items[0]).toEqual(
			expect.objectContaining({ storeCustomerId: null, guestName: 'Cliente Balcao' }),
		)

		const detailResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/orders/${response.body.id}`)
			.set('Cookie', cookie)
		expect(detailResponse.statusCode).toBe(200)
		expect(detailResponse.body).toEqual(
			expect.objectContaining({
				storeCustomerId: null,
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
			}),
		)
	})

	test('walk-in order creation rejects a body with both storeCustomerId and guest fields, or with neither', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'walkin-invalid', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { storeCustomer } = await seedCustomerWithAddress(store.id, 'walkin-invalid')

		const bothResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
			.send({
				storeCustomerId: storeCustomer.id.toString(),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})
		expect(bothResponse.statusCode).toBe(400)

		const neitherResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/stores/${store.id}/orders`)
			.set('Cookie', cookie)
			.send({
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})
		expect(neitherResponse.statusCode).toBe(400)

		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})
})
