import { CepGeocoder } from '@/domain/quintalpet/application/gateways/cep-geocoder'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'
import { authenticateCustomer, resetBetterAuthTables } from './support/better-auth'

// Flat-fee shipping config: baseCents 990, perKmCents 0 within a wide radius,
// so the server-computed local-delivery fee is a distance-independent R$ 9,90 —
// the same figure the pre-distance tests asserted.
async function configureShipping(
	prisma: PrismaService,
	storeId: string,
	overrides: Partial<{ baseCents: number; maxDistanceKm: number }> = {},
) {
	const data = {
		originPostalCode: '02010000',
		baseCents: overrides.baseCents ?? 990,
		perKmCents: 0,
		maxDistanceKm: overrides.maxDistanceKm ?? 50,
		freeShippingDistanceKm: 0,
	}
	await prisma.storeShippingSettings.upsert({
		where: { storeId },
		update: data,
		create: { storeId, ...data },
	})
}

async function resetDatabase(prisma: PrismaService) {
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.orderItem.deleteMany()
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.order.deleteMany()
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

describe('Orders self-service API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
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

	async function provisionCustomerWithAddress(store: { id: string; slug: string }) {
		await configureShipping(prisma, store.id)
		const { cookie } = await authenticateCustomer(app, prisma)
		const base = `/api/v1/stores/${store.slug}/account`

		await request(app.getHttpServer()).get(`${base}/profile`).set('Cookie', cookie)

		const addressResponse = await request(app.getHttpServer())
			.post(`${base}/addresses`)
			.set('Cookie', cookie)
			.send({
				street: 'Rua das Flores',
				number: '123',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '02010-000',
				isDefault: true,
			})

		return { cookie, addressId: addressResponse.body.addresses[0].id as string }
	}

	test('places an order against a saved address: generated orderCode, correct totalCents, PROCESSING status', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Norte', slug: 'quintal-norte-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'happy', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { cookie, addressId } = await provisionCustomerWithAddress(store)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 2 }],
			})

		expect(response.statusCode).toBe(201)
		expect(response.body.orderCode).toBeTruthy()
		expect(response.body.status).toBe('PROCESSING')
		expect(response.body.totalCents).toBe(10990)

		const inventoryItem = await prisma.inventoryItem.findFirst({ where: { variantId: variant.id } })
		expect(inventoryItem?.availableQuantity).toBe(8)

		const movement = await prisma.inventoryMovement.findFirst({
			where: { variantId: variant.id, type: 'OUTBOUND' },
		})
		expect(movement).not.toBeNull()
		expect(movement?.quantityDelta).toBe(-2)

		const storeCustomer = await prisma.storeCustomer.findFirst({ where: { storeId: store.id } })
		expect(storeCustomer?.totalOrders).toBe(1)
		expect(storeCustomer?.totalSpentCents).toBe(10990)
		expect(storeCustomer?.lastOrderAt).not.toBeNull()
	})

	test('ignores a client-supplied shippingCents/deliveryLabel and charges the server-resolved delivery fee instead', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Frete', slug: 'quintal-frete-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'shipping-tamper', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { cookie, addressId } = await provisionCustomerWithAddress(store)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'local-shipping',
				// An attacker attempting to zero out the delivery fee by also
				// sending the old client-priced fields — these must be ignored.
				shippingCents: 0,
				deliveryLabel: 'Frete grátis',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})

		expect(response.statusCode).toBe(201)
		expect(response.body.shippingCents).toBe(990)
		expect(response.body.deliveryLabel).toBe('Entrega local')
		expect(response.body.totalCents).toBe(5990)
	})

	test('rejects local-shipping (400) when the address is beyond the store delivery radius', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Fora de Alcance', slug: 'quintal-fora-alcance-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'out-of-range', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { cookie, addressId } = await provisionCustomerWithAddress(store)
		// Shrink the radius and place the customer CEP far from the origin
		// (updating the row directly so this stays a placement test).
		await configureShipping(prisma, store.id, { maxDistanceKm: 1 })
		await prisma.storeCustomerAddress.update({
			where: { id: addressId },
			data: { postalCode: '09999-999' },
		})
		geocoder.setCoordinates('02010000', -23.5, -46.6)
		geocoder.setCoordinates('09999999', -23.9, -47.2)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('INVALID_DELIVERY_OPTION')
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('returns 503 when the geocoder is down at placement, leaving no order behind', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Geo Down', slug: 'quintal-geo-down-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'geo-down', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { cookie, addressId } = await provisionCustomerWithAddress(store)
		geocoder.setUnavailable('02010000')

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})

		expect(response.statusCode).toBe(503)
		expect(response.body.code).toBe('SHIPPING_QUOTE_UNAVAILABLE')
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('rejects placement (400) for an unknown deliveryOptionId', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Opcao Invalida', slug: 'quintal-opcao-invalida-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'bad-option', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { cookie, addressId } = await provisionCustomerWithAddress(store)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'free-shipping-hack',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('INVALID_DELIVERY_OPTION')
		expect(response.body.message).toBe('Opção de entrega desconhecida.')
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('rejects the whole order (400) when quantity exceeds availableQuantity, with no Order or InventoryMovement left behind', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sul', slug: 'quintal-sul-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'oos', 5000)
		await stockVariant(prisma, store.id, variant.id, 1)
		const { cookie, addressId } = await provisionCustomerWithAddress(store)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 5 }],
			})

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('ORDER_ITEM_UNAVAILABLE')
		expect(response.body.message).toBe(
			'Não há quantidade suficiente em estoque para um dos itens do pedido.',
		)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)
		expect(
			await prisma.inventoryMovement.count({ where: { variantId: variant.id, type: 'OUTBOUND' } }),
		).toBe(0)
	})

	test('rejects placement against an address belonging to a different StoreCustomer', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Leste', slug: 'quintal-leste-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'foreign', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const { addressId: strangerAddressId } = await provisionCustomerWithAddress(store)
		const { cookie } = await provisionCustomerWithAddress(store)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId: strangerAddressId,
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('STORE_CUSTOMER_ADDRESS_NOT_FOUND')
		expect(response.body.message).toBe('Endereço do cliente não encontrado.')
		const inventoryItem = await prisma.inventoryItem.findFirst({ where: { variantId: variant.id } })
		expect(inventoryItem?.availableQuantity).toBe(10)
	})

	test("rejects unauthenticated attempts on place/list/get, matching this API surface's existing no-session behavior", async () => {
		// Note: T5's task file describes this as 403 (CustomerOnlyGuard's
		// "not a customer" rejection). In practice, an entirely missing
		// session is rejected earlier by the underlying Better Auth guard
		// with 401, before CustomerOnlyGuard's own check ever runs — the
		// same layering account-self-service and other @CustomerOnly()
		// routes already have. 403 remains correct for "authenticated but
		// not a customer"; this asserts the no-session case as it actually
		// behaves.
		const store = await prisma.store.create({
			data: { name: 'Quintal Oeste', slug: 'quintal-oeste-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'unauth', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)

		const placeResponse = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.send({
				addressId: 'does-not-matter',
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})
		expect(placeResponse.statusCode).toBe(401)

		const listResponse = await request(app.getHttpServer()).get(
			`/api/v1/stores/${store.slug}/account/orders`,
		)
		expect(listResponse.statusCode).toBe(401)

		const getResponse = await request(app.getHttpServer()).get(
			`/api/v1/stores/${store.slug}/account/orders/some-order-id`,
		)
		expect(getResponse.statusCode).toBe(401)
	})

	test('customer can list and view only their own orders, receiving 404 for another customer order id', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Centro', slug: 'quintal-centro-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'list', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)

		const mine = await provisionCustomerWithAddress(store)
		const placeResponse = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', mine.cookie)
			.send({
				addressId: mine.addressId,
				deliveryOptionId: 'local-shipping',
				paymentMethod: 'PIX',
				items: [{ variantId: variant.id, quantity: 1 }],
			})
		expect(placeResponse.statusCode).toBe(201)
		const myOrderId = placeResponse.body.id

		const listResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', mine.cookie)
		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toHaveLength(1)
		expect(listResponse.body.items[0].id).toBe(myOrderId)

		const detailResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/orders/${myOrderId}`)
			.set('Cookie', mine.cookie)
		expect(detailResponse.statusCode).toBe(200)
		expect(detailResponse.body.id).toBe(myOrderId)

		const someoneElse = await provisionCustomerWithAddress(store)
		const foreignDetailResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/orders/${myOrderId}`)
			.set('Cookie', someoneElse.cookie)
		expect(foreignDetailResponse.statusCode).toBe(404)
	})

	test('recomputes promotions server-side and exposes the persisted discount snapshot in the order read', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Promo', slug: 'quintal-promo-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'promo', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)
		const product = await prisma.product.findFirstOrThrow({ where: { storeId: store.id } })

		await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: '10% na categoria',
				status: 'ACTIVE',
				visibility: 'PUBLIC',
				channels: ['ECOMMERCE'],
				priority: 20,
				isStackable: false,
				targetScope: 'ELIGIBLE_ITEMS',
				conditions: [
					{ type: 'CATEGORY', categoryId: product.primaryCategoryId, includeDescendants: true },
				],
				benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
			},
		})

		const { cookie, addressId } = await provisionCustomerWithAddress(store)

		const placeResponse = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send({
				addressId,
				deliveryOptionId: 'pickup-store',
				paymentMethod: 'PIX',
				// A tampered client total must be ignored.
				totalCents: 1,
				items: [{ variantId: variant.id, quantity: 2 }],
			})

		expect(placeResponse.statusCode).toBe(201)
		expect(placeResponse.body).toMatchObject({
			baseSubtotalCents: 10000,
			itemDiscountTotalCents: 1000,
			subtotalCents: 9000,
			totalDiscountCents: 1000,
			totalCents: 9000,
		})
		expect(placeResponse.body.appliedPromotions).toHaveLength(1)

		const detail = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/orders/${placeResponse.body.id}`)
			.set('Cookie', cookie)
		expect(detail.statusCode).toBe(200)
		expect(detail.body).toMatchObject({
			baseSubtotalCents: 10000,
			itemDiscountTotalCents: 1000,
			subtotalCents: 9000,
			totalDiscountCents: 1000,
		})
		expect(detail.body.items[0]).toMatchObject({
			baseUnitPriceCents: 5000,
			baseLineTotalCents: 10000,
			lineDiscountCents: 1000,
			lineTotalCents: 9000,
		})
		expect(detail.body.appliedPromotions[0]).toMatchObject({
			benefitType: 'PERCENTAGE',
			targetScope: 'ELIGIBLE_ITEMS',
			discountCents: 1000,
		})
	})

	test('a coupon-only promotion is applied at placement only when couponCode is sent', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Cupom', slug: 'quintal-cupom-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'cupom', 5000)
		await stockVariant(prisma, store.id, variant.id, 10)

		await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: 'Cupom BEMVINDO10',
				status: 'ACTIVE',
				visibility: 'PRIVATE',
				channels: ['ECOMMERCE'],
				priority: 10,
				isStackable: false,
				targetScope: 'ORDER_SUBTOTAL',
				conditions: [{ type: 'COUPON', code: 'BEMVINDO10' }],
				benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
			},
		})

		const { cookie, addressId } = await provisionCustomerWithAddress(store)
		const body = (couponCode?: string) => ({
			addressId,
			deliveryOptionId: 'pickup-store',
			paymentMethod: 'PIX',
			items: [{ variantId: variant.id, quantity: 2 }],
			...(couponCode ? { couponCode } : {}),
		})

		const noCoupon = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send(body())
		expect(noCoupon.statusCode).toBe(201)
		expect(noCoupon.body.itemDiscountTotalCents).toBe(0)
		expect(noCoupon.body.appliedPromotions).toHaveLength(0)

		const withCoupon = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/orders`)
			.set('Cookie', cookie)
			.send(body('bemvindo10'))
		expect(withCoupon.statusCode).toBe(201)
		expect(withCoupon.body.itemDiscountTotalCents).toBe(1000)
		expect(withCoupon.body.subtotalCents).toBe(9000)
		expect(withCoupon.body.appliedPromotions[0]).toMatchObject({ couponCode: 'BEMVINDO10' })
	})

	test('two concurrent placements of the same one-unit item resolve to one success and one clean rejection', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Race', slug: 'quintal-race-orders' },
		})
		const variant = await seedVariant(prisma, store.id, 'race', 5000)
		await stockVariant(prisma, store.id, variant.id, 1)

		const customerA = await provisionCustomerWithAddress(store)
		const customerB = await provisionCustomerWithAddress(store)

		const payload = (addressId: string) => ({
			addressId,
			deliveryOptionId: 'local-shipping',
			paymentMethod: 'PIX',
			items: [{ variantId: variant.id, quantity: 1 }],
		})

		const [responseA, responseB] = await Promise.all([
			request(app.getHttpServer())
				.post(`/api/v1/stores/${store.slug}/account/orders`)
				.set('Cookie', customerA.cookie)
				.send(payload(customerA.addressId)),
			request(app.getHttpServer())
				.post(`/api/v1/stores/${store.slug}/account/orders`)
				.set('Cookie', customerB.cookie)
				.send(payload(customerB.addressId)),
		])

		const statusCodes = [responseA.statusCode, responseB.statusCode].sort()
		expect(statusCodes).toEqual([201, 400])

		const inventoryItem = await prisma.inventoryItem.findFirst({ where: { variantId: variant.id } })
		expect(inventoryItem?.availableQuantity).toBe(0)
		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(1)
	})
})
