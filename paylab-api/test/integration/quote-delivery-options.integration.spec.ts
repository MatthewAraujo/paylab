import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { QuoteDeliveryOptionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-delivery-options'
import { ResolveCepDistanceService } from '@/domain/quintalpet/application/use-cases/resolve-cep-distance'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCepGeocodesRepository } from '@/infra/database/prisma/repositories/shipping/prisma-cep-geocodes-repository'
import { PrismaStoreShippingSettingsRepository } from '@/infra/database/prisma/repositories/shipping/prisma-store-shipping-settings-repository'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const geocodes = new PrismaCepGeocodesRepository(prisma)
const settingsRepo = new PrismaStoreShippingSettingsRepository(prisma)
const geocoder = new FakeCepGeocoder()
const distanceService = new ResolveCepDistanceService(geocoder, geocodes)
const useCase = new QuoteDeliveryOptionsUseCase(prisma, settingsRepo, distanceService)

const ORIGIN = '02010-000'

async function resetDatabase() {
	await prisma.storeShippingSettings.deleteMany()
	await prisma.cepGeocode.deleteMany()
	await prisma.store.deleteMany()
}

async function seedStore(slug: string) {
	return prisma.store.create({ data: { name: slug, slug } })
}

async function configureShipping(storeId: string, overrides: Partial<Record<string, number>> = {}) {
	await settingsRepo.upsert(
		StoreShippingSettings.create({
			storeId: new UniqueEntityID(storeId),
			originPostalCode: ORIGIN,
			baseCents: overrides.baseCents ?? 500,
			perKmCents: overrides.perKmCents ?? 100,
			maxDistanceKm: overrides.maxDistanceKm ?? 20,
			freeShippingDistanceKm: overrides.freeShippingDistanceKm ?? 0,
		}),
	)
}

describe('QuoteDeliveryOptionsUseCase (integration)', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
		geocoder.reset()
		// origin ~ 5 km from the customer CEP used below
		geocoder.setCoordinates(ORIGIN, -23.5, -46.6)
		geocoder.setCoordinates('04570-000', -23.54, -46.62)
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('configured store, in-range CEP: pickup free + priced local delivery', async () => {
		const store = await seedStore('quote-a')
		await configureShipping(store.id)

		const { options } = await useCase.execute({ storeSlug: store.slug, postalCode: '04570-000' })

		const pickup = options.find((o) => o.id === 'pickup-store')
		const local = options.find((o) => o.id === 'local-shipping')
		expect(pickup).toMatchObject({ feeCents: 0, available: true, etaDays: [0, 1] })
		expect(local?.available).toBe(true)
		expect(local?.feeCents).toBeGreaterThan(0)
		expect(local?.etaDays).toEqual([1, 2])
	})

	test('CEP beyond maxDistanceKm: local unavailable with out-of-range, pickup still available', async () => {
		const store = await seedStore('quote-b')
		await configureShipping(store.id, { maxDistanceKm: 1 })

		const { options } = await useCase.execute({ storeSlug: store.slug, postalCode: '04570-000' })

		const local = options.find((o) => o.id === 'local-shipping')
		expect(local?.available).toBe(false)
		expect(local?.unavailableReason).toBe('out-of-range')
		expect(options.find((o) => o.id === 'pickup-store')?.available).toBe(true)
	})

	test('unconfigured store: local unavailable with not-configured, no geocoding', async () => {
		const store = await seedStore('quote-c')

		const { options } = await useCase.execute({ storeSlug: store.slug, postalCode: '04570-000' })

		const local = options.find((o) => o.id === 'local-shipping')
		expect(local?.available).toBe(false)
		expect(local?.unavailableReason).toBe('not-configured')
		expect(geocoder.calls).toHaveLength(0)
	})

	test('a CEP within the free-shipping radius zeroes the local fee', async () => {
		const store = await seedStore('quote-d')
		// stubbed distance for '04570-000' is ~6 km; a 10 km free radius covers it
		await configureShipping(store.id, { freeShippingDistanceKm: 10 })

		const { options } = await useCase.execute({
			storeSlug: store.slug,
			postalCode: '04570-000',
		})

		expect(options.find((o) => o.id === 'local-shipping')?.feeCents).toBe(0)
	})

	test('a non-existent CEP throws InvalidPostalCodeError', async () => {
		const store = await seedStore('quote-e')
		await configureShipping(store.id)
		geocoder.setNotFound('99999-999')

		await expect(
			useCase.execute({ storeSlug: store.slug, postalCode: '99999-999' }),
		).rejects.toBeInstanceOf(InvalidPostalCodeError)
	})

	test('a geocoder outage throws GeocoderUnavailableError', async () => {
		const store = await seedStore('quote-f')
		await configureShipping(store.id)
		geocoder.setUnavailable('04570-000')

		await expect(
			useCase.execute({ storeSlug: store.slug, postalCode: '04570-000' }),
		).rejects.toBeInstanceOf(GeocoderUnavailableError)
	})
})
