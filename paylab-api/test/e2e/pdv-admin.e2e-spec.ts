import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
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
	options: { priceCents?: number; barcode?: string | null } = {},
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
			priceCents: options.priceCents ?? 5000,
			status: 'ACTIVE',
			barcode: options.barcode ?? null,
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

const base = '/api/v1/admin/pdv'

describe('PDV admin API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)
		await app.init()
	})

	beforeEach(async () => {
		await resetDatabase(prisma)
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	async function openSession(cookie: string) {
		const response = await request(app.getHttpServer())
			.post(`${base}/sessions`)
			.set('Cookie', cookie)
			.send({})
		return response
	}

	test('POST /sessions opens a session for the authenticated StoreMember store and returns an empty draft', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)

		const response = await openSession(cookie)

		expect(response.statusCode).toBe(201)
		expect(response.body.session.storeId).toBe(store.id)
		expect(response.body.session.status).toBe('OPEN')
		expect(response.body.draft.items).toEqual([])
		expect(response.body.draft.status).toBe('OPEN')
	})

	test('POST /sessions rejects an unauthenticated caller', async () => {
		const response = await request(app.getHttpServer()).post(`${base}/sessions`).send({})
		expect(response.statusCode).toBe(401)
	})

	test('GET /sessions/current returns null session/draft when none is open, and the open one otherwise', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)

		const emptyResponse = await request(app.getHttpServer())
			.get(`${base}/sessions/current`)
			.set('Cookie', cookie)
		expect(emptyResponse.statusCode).toBe(200)
		expect(emptyResponse.body.session).toBeNull()
		expect(emptyResponse.body.draft).toBeNull()

		const opened = await openSession(cookie)

		const currentResponse = await request(app.getHttpServer())
			.get(`${base}/sessions/current`)
			.set('Cookie', cookie)
		expect(currentResponse.statusCode).toBe(200)
		expect(currentResponse.body.session.id).toBe(opened.body.session.id)
		expect(currentResponse.body.draft.id).toBe(opened.body.draft.id)
	})

	test('GET /sessions/current rejects an unauthenticated caller', async () => {
		const response = await request(app.getHttpServer()).get(`${base}/sessions/current`)
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/draft/items adds an item by variantId; a different store member gets 404', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'add-item')
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 2 })

		expect(response.statusCode).toBe(201)
		expect(response.body.items).toHaveLength(1)
		expect(response.body.items[0].variantId).toBe(variant.id)
		expect(response.body.items[0].quantity).toBe(2)
		expect(response.body.items[0].unitPriceCents).toBe(5000)
		expect(response.body.totalCents).toBe(10000)

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', other.cookie)
			.send({ variantId: variant.id, quantity: 1 })
		expect(crossStoreResponse.statusCode).toBe(404)
	})

	test('POST /sessions/:id/draft/items rejects an unauthenticated caller', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'add-item-unauth')
		const opened = await openSession(cookie)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${opened.body.session.id}/draft/items`)
			.send({ variantId: variant.id, quantity: 1 })
		expect(response.statusCode).toBe(401)
	})

	test('PATCH /sessions/:id/draft/items/:variantId removes/adjusts an item; a different store member gets 404', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'adjust-item')
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 3 })

		const response = await request(app.getHttpServer())
			.patch(`${base}/sessions/${sessionId}/draft/items/${variant.id}`)
			.set('Cookie', cookie)
			.send({ quantity: 1 })

		expect(response.statusCode).toBe(200)
		expect(response.body.items[0].quantity).toBe(2)

		const crossStoreResponse = await request(app.getHttpServer())
			.patch(`${base}/sessions/${sessionId}/draft/items/${variant.id}`)
			.set('Cookie', other.cookie)
			.send({ quantity: 1 })
		expect(crossStoreResponse.statusCode).toBe(404)
	})

	test('PATCH /sessions/:id/draft/items/:variantId rejects an unauthenticated caller', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'adjust-item-unauth')
		const opened = await openSession(cookie)

		const response = await request(app.getHttpServer())
			.patch(`${base}/sessions/${opened.body.session.id}/draft/items/${variant.id}`)
			.send({ quantity: 1 })
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/draft/cancel cancels the active draft; a different store member gets 404', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'cancel-draft')
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 1 })

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/cancel`)
			.set('Cookie', other.cookie)
		expect(crossStoreResponse.statusCode).toBe(404)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/cancel`)
			.set('Cookie', cookie)
		expect(response.statusCode).toBe(200)
		expect(response.body.status).toBe('CANCELLED')
		expect(response.body.items).toEqual([])
	})

	test('POST /sessions/:id/draft/cancel rejects an unauthenticated caller', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)

		const response = await request(app.getHttpServer()).post(
			`${base}/sessions/${opened.body.session.id}/draft/cancel`,
		)
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/draft opens a new empty draft after a cancel leaves the session without one', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'start-new-after-cancel')
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 1 })
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/cancel`)
			.set('Cookie', cookie)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(201)
		expect(response.body.status).toBe('OPEN')
		expect(response.body.items).toEqual([])
		expect(response.body.id).not.toBe(opened.body.draft.id)

		const currentResponse = await request(app.getHttpServer())
			.get(`${base}/sessions/current`)
			.set('Cookie', cookie)
		expect(currentResponse.body.draft.id).toBe(response.body.id)
	})

	test('POST /sessions/:id/draft returns a conflict when the session already has an active draft', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(409)
		expect(response.body.code).toBe('SALE_DRAFT_ALREADY_ACTIVE')
		expect(response.body.message).toBe('Esta sessão de PDV já possui uma venda em andamento.')
	})

	test('POST /sessions/:id/draft returns 404 for another store member or a nonexistent session', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/cancel`)
			.set('Cookie', cookie)

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft`)
			.set('Cookie', other.cookie)
		expect(crossStoreResponse.statusCode).toBe(404)

		const nonExistentResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/00000000-0000-4000-8000-000000000000/draft`)
			.set('Cookie', cookie)
		expect(nonExistentResponse.statusCode).toBe(404)
	})

	test('POST /sessions/:id/draft rejects an unauthenticated caller', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/cancel`)
			.set('Cookie', cookie)

		const response = await request(app.getHttpServer()).post(`${base}/sessions/${sessionId}/draft`)
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/draft/finalize finalizes with a guest customer and CASH, returning the created order; a different store member gets 404', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'finalize')
		await stockVariant(prisma, store.id, variant.id, 10)
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 2 })

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/finalize`)
			.set('Cookie', other.cookie)
			.send({ guestName: 'Cliente Balcao', guestPhone: '11999998888', paymentMethod: 'CASH' })
		expect(crossStoreResponse.statusCode).toBe(404)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/finalize`)
			.set('Cookie', cookie)
			.send({ guestName: 'Cliente Balcao', guestPhone: '11999998888', paymentMethod: 'CASH' })

		expect(response.statusCode).toBe(201)
		expect(response.body.order.status).toBe('DELIVERED')
		expect(response.body.order.paymentMethod).toBe('CASH')
		expect(response.body.order.totalCents).toBe(10000)
		expect(response.body.unmatchedBarcodes).toEqual([])

		const currentResponse = await request(app.getHttpServer())
			.get(`${base}/sessions/current`)
			.set('Cookie', cookie)
		expect(currentResponse.body.draft.items).toEqual([])
		expect(currentResponse.body.draft.id).not.toBe(opened.body.draft.id)
	})

	test('POST /sessions/:id/draft/finalize applies a PDV promotion, keeps shipping zero, and returns the snapshot read-model', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'promo-finalize', { priceCents: 5000 })
		await stockVariant(prisma, store.id, variant.id, 10)
		await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: 'Balcão 10%',
				status: 'ACTIVE',
				visibility: 'PUBLIC',
				channels: ['PDV'],
				priority: 10,
				isStackable: false,
				targetScope: 'ORDER_SUBTOTAL',
				conditions: [{ type: 'MIN_CART_VALUE', amountCents: 1 }] as never,
				benefits: [{ type: 'PERCENTAGE', percentage: 10 }] as never,
			},
		})
		// An ecommerce-only campaign that must NOT touch the walk-in sale.
		await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: 'Só no site 50%',
				status: 'ACTIVE',
				visibility: 'PUBLIC',
				channels: ['ECOMMERCE'],
				priority: 20,
				isStackable: false,
				targetScope: 'ORDER_SUBTOTAL',
				conditions: [{ type: 'MIN_CART_VALUE', amountCents: 1 }] as never,
				benefits: [{ type: 'PERCENTAGE', percentage: 50 }] as never,
			},
		})
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 2 })

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/finalize`)
			.set('Cookie', cookie)
			.send({ guestName: 'Cliente Balcao', guestPhone: '11999998888', paymentMethod: 'CASH' })

		expect(response.statusCode).toBe(201)
		const order = response.body.order
		expect(order.baseSubtotalCents).toBe(10000)
		expect(order.itemDiscountTotalCents).toBe(1000)
		expect(order.subtotalCents).toBe(9000)
		expect(order.shippingBaseCents).toBe(0)
		expect(order.shippingDiscountCents).toBe(0)
		expect(order.shippingCents).toBe(0)
		expect(order.totalDiscountCents).toBe(1000)
		expect(order.totalCents).toBe(9000)
		expect(order.appliedPromotions).toHaveLength(1)
		expect(order.appliedPromotions[0]).toMatchObject({
			name: 'Balcão 10%',
			targetScope: 'ORDER_SUBTOTAL',
			discountCents: 1000,
			couponCode: null,
		})
		expect(order.items[0]).toMatchObject({
			baseUnitPriceCents: 5000,
			baseLineTotalCents: 10000,
			lineDiscountCents: 1000,
		})

		const persisted = await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
		expect(persisted.itemDiscountTotalCents).toBe(1000)
		expect(persisted.shippingBaseCents).toBe(0)
	})

	test('POST /sessions/:id/draft/finalize rejects an unauthenticated caller', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${opened.body.session.id}/draft/finalize`)
			.send({ guestName: 'Cliente Balcao', guestPhone: '11999998888', paymentMethod: 'CASH' })
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/unmatched-barcodes/resolve resolves a barcode; a different store member gets 404', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const soldVariant = await seedVariant(prisma, store.id, 'resolve-sold')
		await stockVariant(prisma, store.id, soldVariant.id, 10)
		const targetVariant = await seedVariant(prisma, store.id, 'resolve-target')
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id

		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: soldVariant.id, quantity: 1 })

		// Force an unmatched barcode onto the active draft directly (barcode
		// scanning itself is T10's WS path, out of scope here).
		await prisma.saleDraft.update({
			where: { id: opened.body.draft.id },
			data: { unmatchedBarcodes: ['scanned-code-1'] },
		})

		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/finalize`)
			.set('Cookie', cookie)
			.send({ guestName: 'Cliente Balcao', guestPhone: '11999998888', paymentMethod: 'CASH' })

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/unmatched-barcodes/resolve`)
			.set('Cookie', other.cookie)
			.send({ barcode: 'scanned-code-1', variantId: targetVariant.id })
		expect(crossStoreResponse.statusCode).toBe(404)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/unmatched-barcodes/resolve`)
			.set('Cookie', cookie)
			.send({ barcode: 'scanned-code-1', variantId: targetVariant.id })
		expect(response.statusCode).toBe(200)

		const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
			where: { id: targetVariant.id },
		})
		expect(updatedVariant.barcode).toBe('scanned-code-1')
	})

	test('POST /sessions/:id/unmatched-barcodes/resolve rejects an unauthenticated caller', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'resolve-unauth')
		const opened = await openSession(cookie)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${opened.body.session.id}/unmatched-barcodes/resolve`)
			.send({ barcode: 'any-code', variantId: variant.id })
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/close closes the session; a different store member gets 404', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id

		const crossStoreResponse = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/close`)
			.set('Cookie', other.cookie)
		expect(crossStoreResponse.statusCode).toBe(404)

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/close`)
			.set('Cookie', cookie)
		expect(response.statusCode).toBe(200)
		expect(response.body.status).toBe('CLOSED')
	})

	test('POST /sessions/:id/close rejects an unauthenticated caller', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		const opened = await openSession(cookie)

		const response = await request(app.getHttpServer()).post(
			`${base}/sessions/${opened.body.session.id}/close`,
		)
		expect(response.statusCode).toBe(401)
	})

	test('POST /sessions/:id/close blocked while the active draft still has items returns 400', async () => {
		const { cookie, store } = await authenticateStoreMember(app, prisma)
		const variant = await seedVariant(prisma, store.id, 'close-blocked')
		const opened = await openSession(cookie)
		const sessionId = opened.body.session.id
		await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/draft/items`)
			.set('Cookie', cookie)
			.send({ variantId: variant.id, quantity: 1 })

		const response = await request(app.getHttpServer())
			.post(`${base}/sessions/${sessionId}/close`)
			.set('Cookie', cookie)
		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('SALE_DRAFT_NOT_EMPTY')
		expect(response.body.message).toBe(
			'Não é possível fechar uma sessão de PDV enquanto a venda ativa ainda tiver itens.',
		)
	})
})
