import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()

async function resetDatabase() {
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

describe('Prisma shipping schema invariants', () => {
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

	test('StoreShippingSettings is 1:1 with a store and unique on storeId', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Frete', slug: 'quintal-frete-schema' },
		})

		const settings = await prisma.storeShippingSettings.create({
			data: {
				storeId: store.id,
				originPostalCode: '02010000',
				baseCents: 500,
				perKmCents: 120,
				maxDistanceKm: 15,
				freeShippingDistanceKm: 5,
			},
		})

		expect(settings.storeId).toBe(store.id)
		expect(settings.freeShippingDistanceKm).toBe(5)

		await expect(
			prisma.storeShippingSettings.create({
				data: {
					storeId: store.id,
					originPostalCode: '02010000',
					baseCents: 900,
					perKmCents: 100,
					maxDistanceKm: 10,
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		const viaRelation = await prisma.store.findUnique({
			where: { id: store.id },
			include: { shippingSettings: true },
		})
		expect(viaRelation?.shippingSettings?.id).toBe(settings.id)
	})

	test('freeShippingDistanceKm defaults to 0 (free shipping disabled)', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sem Limite', slug: 'quintal-sem-limite-schema' },
		})

		const settings = await prisma.storeShippingSettings.create({
			data: {
				storeId: store.id,
				originPostalCode: '02010000',
				baseCents: 500,
				perKmCents: 120,
				maxDistanceKm: 15,
			},
		})

		expect(settings.freeShippingDistanceKm).toBe(0)
	})

	test('deleting a store cascades to its shipping settings', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Cascade', slug: 'quintal-cascade-schema' },
		})
		await prisma.storeShippingSettings.create({
			data: {
				storeId: store.id,
				originPostalCode: '02010000',
				baseCents: 500,
				perKmCents: 120,
				maxDistanceKm: 15,
			},
		})

		await prisma.store.delete({ where: { id: store.id } })

		expect(await prisma.storeShippingSettings.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('CepGeocode is a global cache keyed uniquely by normalized postal code', async () => {
		const geocode = await prisma.cepGeocode.create({
			data: {
				postalCode: '02010000',
				latitude: -23.5015,
				longitude: -46.6255,
			},
		})

		expect(geocode.provider).toBe('awesomeapi')
		expect(geocode.resolvedAt).toBeInstanceOf(Date)

		await expect(
			prisma.cepGeocode.create({
				data: {
					postalCode: '02010000',
					latitude: -23.5,
					longitude: -46.6,
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		await expect(
			prisma.cepGeocode.create({
				data: {
					postalCode: '01310100',
					latitude: -23.5613,
					longitude: -46.6565,
				},
			}),
		).resolves.toMatchObject({ postalCode: '01310100' })
	})
})
