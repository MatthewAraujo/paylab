import { CepGeocoder } from '@/domain/quintalpet/application/gateways/cep-geocoder'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'

const ORIGIN = '02010000'
const NEAR = '04570000'

async function resetDatabase(prisma: PrismaService) {
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.store.deleteMany()
}

async function seedConfiguredStore(
	prisma: PrismaService,
	slug: string,
	overrides: Partial<{
		baseCents: number
		perKmCents: number
		maxDistanceKm: number
		freeShippingDistanceKm: number
	}> = {},
) {
	const store = await prisma.store.create({ data: { name: slug, slug } })
	await prisma.storeShippingSettings.create({
		data: {
			storeId: store.id,
			originPostalCode: ORIGIN,
			baseCents: overrides.baseCents ?? 500,
			perKmCents: overrides.perKmCents ?? 100,
			maxDistanceKm: overrides.maxDistanceKm ?? 20,
			freeShippingDistanceKm: overrides.freeShippingDistanceKm ?? 0,
		},
	})
	return store
}

describe('Storefront shipping quote API (E2E)', () => {
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
		geocoder.setCoordinates(ORIGIN, -23.5, -46.6)
		geocoder.setCoordinates(NEAR, -23.54, -46.62)
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	const quote = (body: Record<string, unknown>, query = '') =>
		request(app.getHttpServer()).post(`/api/v1/storefront/shipping/quote${query}`).send(body)

	test('configured store + in-range CEP returns both options with a priced local delivery', async () => {
		const store = await seedConfiguredStore(prisma, 'quote-happy')

		const response = await quote({ store: store.slug, postalCode: '04570-000' })

		expect(response.statusCode).toBe(200)
		const local = response.body.options.find((o: { id: string }) => o.id === 'local-shipping')
		const pickup = response.body.options.find((o: { id: string }) => o.id === 'pickup-store')
		expect(pickup).toMatchObject({ feeCents: 0, available: true })
		expect(local.available).toBe(true)
		// base 500 + ceil(distance) * 100; distance is a few km
		expect(local.feeCents).toBeGreaterThanOrEqual(600)
	})

	test('CEP beyond the radius flags local delivery out-of-range but keeps pickup', async () => {
		const store = await seedConfiguredStore(prisma, 'quote-far', { maxDistanceKm: 1 })

		const response = await quote({ store: store.slug, postalCode: '04570-000' })

		expect(response.statusCode).toBe(200)
		const local = response.body.options.find((o: { id: string }) => o.id === 'local-shipping')
		expect(local).toMatchObject({ available: false, unavailableReason: 'out-of-range' })
		expect(
			response.body.options.find((o: { id: string }) => o.id === 'pickup-store').available,
		).toBe(true)
	})

	test('store without shipping settings omits local delivery (not-configured)', async () => {
		const store = await prisma.store.create({ data: { name: 'nc', slug: 'quote-nc' } })

		const response = await quote({ store: store.slug, postalCode: '04570-000' })

		expect(response.statusCode).toBe(200)
		const local = response.body.options.find((o: { id: string }) => o.id === 'local-shipping')
		expect(local).toMatchObject({ available: false, unavailableReason: 'not-configured' })
	})

	test('a CEP within the free-shipping radius zeroes the local fee in the preview', async () => {
		// stubbed distance for '04570-000' is ~6 km; a 12 km free radius covers it
		const store = await seedConfiguredStore(prisma, 'quote-free', {
			freeShippingDistanceKm: 12,
		})

		const response = await quote({
			store: store.slug,
			postalCode: '04570-000',
		})

		const local = response.body.options.find((o: { id: string }) => o.id === 'local-shipping')
		expect(local.feeCents).toBe(0)
	})

	test('a well-formed but non-existent CEP returns 400 INVALID_POSTAL_CODE', async () => {
		const store = await seedConfiguredStore(prisma, 'quote-badcep')
		geocoder.setNotFound('99999-999')

		const response = await quote({ store: store.slug, postalCode: '99999-999' })

		expect(response.statusCode).toBe(400)
		expect(response.body.code).toBe('INVALID_POSTAL_CODE')
	})

	test('a geocoder outage returns 503 SHIPPING_QUOTE_UNAVAILABLE', async () => {
		const store = await seedConfiguredStore(prisma, 'quote-down')
		geocoder.setUnavailable('04570-000')

		const response = await quote({ store: store.slug, postalCode: '04570-000' })

		expect(response.statusCode).toBe(503)
		expect(response.body.code).toBe('SHIPPING_QUOTE_UNAVAILABLE')
	})

	test('a malformed CEP is rejected with 400', async () => {
		const store = await seedConfiguredStore(prisma, 'quote-malformed')

		const response = await quote({ store: store.slug, postalCode: '123' })

		expect(response.statusCode).toBe(400)
	})

	test('resolves the store from the ?store= query string too', async () => {
		const store = await seedConfiguredStore(prisma, 'quote-viaquery')

		const response = await quote({ postalCode: '04570-000' }, `?store=${store.slug}`)

		expect(response.statusCode).toBe(200)
		expect(response.body.options).toHaveLength(2)
	})
})
