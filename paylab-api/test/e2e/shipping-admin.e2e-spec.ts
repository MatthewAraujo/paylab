import { CepGeocoder } from '@/domain/quintalpet/application/gateways/cep-geocoder'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

const validBody = {
	originPostalCode: '02010-000',
	baseCents: 500,
	perKmCents: 120,
	maxDistanceKm: 15,
	freeShippingDistanceKm: 5,
}

describe('Shipping admin settings API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
	const geocoder = new FakeCepGeocoder()

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
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

	const server = () => app.getHttpServer()

	test('GET before any configuration returns { configured: false, settings: null }', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)

		const response = await request(server())
			.get('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({ configured: false, settings: null })
	})

	test('PUT with valid data + a geocodable origin CEP persists and echoes the settings', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)

		const putResponse = await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send(validBody)

		expect(putResponse.statusCode).toBe(200)
		expect(putResponse.body.configured).toBe(true)
		expect(putResponse.body.settings).toMatchObject({
			originPostalCode: '02010000',
			baseCents: 500,
			perKmCents: 120,
			maxDistanceKm: 15,
			freeShippingDistanceKm: 5,
		})

		const getResponse = await request(server())
			.get('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
		expect(getResponse.body.configured).toBe(true)
		expect(getResponse.body.settings.baseCents).toBe(500)

		// The origin CEP was geocoded once and cached.
		expect(await prisma.cepGeocode.count({ where: { postalCode: '02010000' } })).toBe(1)
	})

	test('PUT twice updates the single row in place', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)

		await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send(validBody)
		const second = await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send({ ...validBody, baseCents: 999, originPostalCode: '04570-000' })

		expect(second.statusCode).toBe(200)
		expect(second.body.settings.baseCents).toBe(999)

		const store = await prisma.store.findFirstOrThrow()
		expect(await prisma.storeShippingSettings.count({ where: { storeId: store.id } })).toBe(1)
	})

	test('PUT with a non-existent origin CEP returns 400 INVALID_POSTAL_CODE', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		geocoder.setNotFound('99999-999')

		const response = await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send({ ...validBody, originPostalCode: '99999-999' })

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('INVALID_POSTAL_CODE')
	})

	test('PUT with an unavailable geocoder returns 503 SHIPPING_QUOTE_UNAVAILABLE', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)
		geocoder.setUnavailable('02010-000')

		const response = await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send(validBody)

		expect(response.statusCode).toBe(503)
		expect(response.body.code).toBe('SHIPPING_QUOTE_UNAVAILABLE')
	})

	test('PUT with invalid numbers is rejected with 400', async () => {
		const { cookie } = await authenticateStoreMember(app, prisma)

		const negative = await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send({ ...validBody, baseCents: -1 })
		expect(negative.statusCode).toBe(400)

		const zeroDistance = await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', cookie)
			.send({ ...validBody, maxDistanceKm: 0 })
		expect(zeroDistance.statusCode).toBe(400)
	})

	test('store A cannot read or write store B settings (tenant isolation)', async () => {
		const a = await authenticateStoreMember(app, prisma)
		const b = await authenticateStoreMember(app, prisma)

		await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', a.cookie)
			.send({ ...validBody, baseCents: 111 })

		const bGet = await request(server())
			.get('/api/v1/admin/shipping-settings')
			.set('Cookie', b.cookie)
		expect(bGet.body).toEqual({ configured: false, settings: null })

		await request(server())
			.put('/api/v1/admin/shipping-settings')
			.set('Cookie', b.cookie)
			.send({ ...validBody, baseCents: 222 })

		const aGet = await request(server())
			.get('/api/v1/admin/shipping-settings')
			.set('Cookie', a.cookie)
		expect(aGet.body.settings.baseCents).toBe(111)
	})
})
