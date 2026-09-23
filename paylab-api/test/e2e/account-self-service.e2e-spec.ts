import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticateCustomer, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.cRMInteraction.deleteMany()
	await prisma.cRMProfile.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

describe('Account self-service API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

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

	test('first authenticated visit transparently provisions a StoreCustomer, and a second visit is idempotent', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Norte', slug: 'quintal-norte-self-service' },
		})
		const { user, cookie } = await authenticateCustomer(app, prisma, {
			name: 'Ana Cliente',
			email: 'ana-cliente@quintal.test',
		})

		const firstResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/profile`)
			.set('Cookie', cookie)

		expect(firstResponse.statusCode).toBe(200)
		expect(firstResponse.body.email).toBe('ana-cliente@quintal.test')
		expect(firstResponse.body.name).toBe('Ana Cliente')
		const firstId = firstResponse.body.id

		const storeCustomerCount = await prisma.storeCustomer.count({
			where: { storeId: store.id, customerProfileId: user.id },
		})
		expect(storeCustomerCount).toBe(1)

		const secondResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${store.slug}/account/profile`)
			.set('Cookie', cookie)

		expect(secondResponse.statusCode).toBe(200)
		expect(secondResponse.body.id).toBe(firstId)

		const countAfterSecondVisit = await prisma.storeCustomer.count({
			where: { storeId: store.id, customerProfileId: user.id },
		})
		expect(countAfterSecondVisit).toBe(1)
	})

	test('PATCH /account/profile updates name/phone but ignores admin-only fields', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sul', slug: 'quintal-sul-self-service' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.patch(`/api/v1/stores/${store.slug}/account/profile`)
			.set('Cookie', cookie)
			.send({
				name: 'Updated Name',
				phone: '+5511988887777',
				status: 'SUSPENDED',
				totalOrders: 999,
				totalSpentCents: 999999,
			})

		expect(response.statusCode).toBe(200)
		expect(response.body.name).toBe('Updated Name')
		expect(response.body.phone).toBe('+5511988887777')
		expect(response.body.status).toBeUndefined()
		expect(response.body.totalOrders).toBeUndefined()

		const persisted = await prisma.storeCustomer.findFirst({ where: { storeId: store.id } })
		expect(persisted?.status).toBe('ACTIVE')
		expect(persisted?.totalOrders).toBe(0)
	})

	test('customer can add, update, remove, and set default addresses for their own account', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Leste', slug: 'quintal-leste-self-service' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)
		const base = `/api/v1/stores/${store.slug}/account`

		const addResponse = await request(app.getHttpServer())
			.post(`${base}/addresses`)
			.set('Cookie', cookie)
			.send({
				street: 'Rua A',
				number: '10',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '02010-000',
				isDefault: true,
			})
		expect(addResponse.statusCode).toBe(201)
		const addressId = addResponse.body.addresses[0].id

		const updateResponse = await request(app.getHttpServer())
			.patch(`${base}/addresses/${addressId}`)
			.set('Cookie', cookie)
			.send({ city: 'Campinas' })
		expect(updateResponse.statusCode).toBe(200)
		expect(updateResponse.body.addresses[0].city).toBe('Campinas')

		const removeResponse = await request(app.getHttpServer())
			.delete(`${base}/addresses/${addressId}`)
			.set('Cookie', cookie)
		expect(removeResponse.statusCode).toBe(200)
		expect(removeResponse.body.addresses).toHaveLength(0)
	})

	test('accepts adding and updating an address with any valid Brazilian CEP, near or far from the store', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Leste', slug: 'quintal-leste-delivery-zone' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)
		const base = `/api/v1/stores/${store.slug}/account`

		// A CEP far outside the old hardcoded Bairro Santana range now succeeds —
		// the delivery-area limit lives only at quote/placement time.
		const farResponse = await request(app.getHttpServer())
			.post(`${base}/addresses`)
			.set('Cookie', cookie)
			.send({
				street: 'Rua A',
				number: '10',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '01000-000',
				isDefault: true,
			})
		expect(farResponse.statusCode).toBe(201)
		const addressId = farResponse.body.addresses[0].id

		const updateResponse = await request(app.getHttpServer())
			.patch(`${base}/addresses/${addressId}`)
			.set('Cookie', cookie)
			.send({ postalCode: '03000-000' })
		expect(updateResponse.statusCode).toBe(200)
		expect(updateResponse.body.addresses[0].postalCode).toBe('03000-000')
	})

	test('still rejects a malformed CEP with a validation error', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal CEP', slug: 'quintal-cep-format' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/addresses`)
			.set('Cookie', cookie)
			.send({
				street: 'Rua A',
				number: '10',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '123',
				isDefault: true,
			})
		expect(response.statusCode).toBe(400)
	})

	test('adding a favorite for a product that is not available returns 404 with a friendly code/message', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Oeste', slug: 'quintal-oeste-self-service' },
		})
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.post(`/api/v1/stores/${store.slug}/account/favorites/does-not-exist`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(404)
		expect(response.body.code).toBe('FAVORITE_PRODUCT_NOT_AVAILABLE')
		expect(response.body.message).toBe(
			'O produto "does-not-exist" não está disponível para favoritar nesta loja.',
		)
	})

	test("a customer's StoreCustomer for store A is invisible through store B's slug", async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'Store A', slug: 'store-a-self-service' } }),
			prisma.store.create({ data: { name: 'Store B', slug: 'store-b-self-service' } }),
		])
		const { cookie } = await authenticateCustomer(app, prisma)

		const storeAResponse = await request(app.getHttpServer())
			.patch(`/api/v1/stores/${storeA.slug}/account/profile`)
			.set('Cookie', cookie)
			.send({ name: 'Store A Name' })
		expect(storeAResponse.statusCode).toBe(200)

		const storeBResponse = await request(app.getHttpServer())
			.get(`/api/v1/stores/${storeB.slug}/account/profile`)
			.set('Cookie', cookie)
		expect(storeBResponse.statusCode).toBe(200)
		expect(storeBResponse.body.name).not.toBe('Store A Name')
		expect(storeBResponse.body.id).not.toBe(storeAResponse.body.id)
	})

	test('an unknown store slug returns 404, not 500', async () => {
		const { cookie } = await authenticateCustomer(app, prisma)

		const response = await request(app.getHttpServer())
			.get('/api/v1/stores/does-not-exist/account/profile')
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(404)
	})
})
