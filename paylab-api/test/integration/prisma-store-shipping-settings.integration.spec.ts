import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreShippingSettingsRepository } from '@/domain/quintalpet/application/repositories/store-shipping-settings-repository'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaStoreShippingSettingsRepository } from '@/infra/database/prisma/repositories/shipping/prisma-store-shipping-settings-repository'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const repository: StoreShippingSettingsRepository = new PrismaStoreShippingSettingsRepository(
	prisma,
)

async function resetDatabase() {
	await prisma.storeShippingSettings.deleteMany()
	await prisma.store.deleteMany()
}

describe('PrismaStoreShippingSettingsRepository (integration)', () => {
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

	test('findByStoreId returns null before the first upsert', async () => {
		const store = await prisma.store.create({ data: { name: 'A', slug: 'a-settings' } })
		expect(await repository.findByStoreId(store.id)).toBeNull()
	})

	test('upsert creates the single row and then updates it in place', async () => {
		const store = await prisma.store.create({ data: { name: 'B', slug: 'b-settings' } })

		await repository.upsert(
			StoreShippingSettings.create({
				storeId: new UniqueEntityID(store.id),
				originPostalCode: '02010-000',
				baseCents: 500,
				perKmCents: 120,
				maxDistanceKm: 15,
				freeShippingDistanceKm: 0,
			}),
		)

		const existing = await repository.findByStoreId(store.id)
		expect(existing?.baseCents).toBe(500)

		const updated = StoreShippingSettings.create(
			{
				storeId: new UniqueEntityID(store.id),
				originPostalCode: '04570-000',
				baseCents: 900,
				perKmCents: 200,
				maxDistanceKm: 25,
				freeShippingDistanceKm: 4,
			},
			existing?.id,
		)
		await repository.upsert(updated)

		const reloaded = await repository.findByStoreId(store.id)
		expect(reloaded?.baseCents).toBe(900)
		expect(reloaded?.originPostalCode).toBe('04570000')
		expect(reloaded?.freeShippingDistanceKm).toBe(4)
		expect(await prisma.storeShippingSettings.count({ where: { storeId: store.id } })).toBe(1)
	})

	test('settings are isolated per store', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'IA', slug: 'ia-settings' } }),
			prisma.store.create({ data: { name: 'IB', slug: 'ib-settings' } }),
		])

		await repository.upsert(
			StoreShippingSettings.create({
				storeId: new UniqueEntityID(storeA.id),
				originPostalCode: '02010-000',
				baseCents: 111,
				perKmCents: 10,
				maxDistanceKm: 10,
				freeShippingDistanceKm: 0,
			}),
		)

		expect(await repository.findByStoreId(storeB.id)).toBeNull()
		expect((await repository.findByStoreId(storeA.id))?.baseCents).toBe(111)
	})
})
