import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()

async function resetDatabase() {
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

async function createStore(suffix: string) {
	return prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-promo-${suffix}` },
	})
}

describe('Prisma promotions schema invariants', () => {
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

	test('a promotion row round-trips with channels, visibility, conditions and benefits', async () => {
		const store = await createStore('round-trip')

		const created = await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: 'Leve 3 pague 2 nos sachês',
				status: 'ACTIVE',
				visibility: 'PUBLIC',
				channels: ['ECOMMERCE', 'PDV'],
				priority: 10,
				isStackable: false,
				targetScope: 'ELIGIBLE_ITEMS',
				startsAt: new Date('2026-09-01T00:00:00.000Z'),
				endsAt: new Date('2026-09-30T23:59:59.000Z'),
				conditions: [
					{ type: 'CATEGORY', categoryId: 'cat-sachets', includeDescendants: true },
					{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 3 },
				],
				benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }],
				publicHighlight: {
					badge: 'Leve 3 pague 2',
					projectedPack: { quantity: 3, priceCents: 6000 },
				},
			},
		})

		const found = await prisma.promotion.findUnique({ where: { id: created.id } })

		expect(found).not.toBeNull()
		expect(found?.channels).toEqual(['ECOMMERCE', 'PDV'])
		expect(found?.visibility).toBe('PUBLIC')
		expect(found?.status).toBe('ACTIVE')
		expect(found?.targetScope).toBe('ELIGIBLE_ITEMS')
		expect(found?.conditions).toEqual([
			{ type: 'CATEGORY', categoryId: 'cat-sachets', includeDescendants: true },
			{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 3 },
		])
		expect(found?.benefits).toEqual([{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }])
		expect(found?.publicHighlight).toMatchObject({ badge: 'Leve 3 pague 2' })
	})

	test('promotion defaults are DRAFT / PRIVATE with empty condition and benefit payloads', async () => {
		const store = await createStore('defaults')

		const created = await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: 'Rascunho',
				channels: ['ECOMMERCE'],
				targetScope: 'ORDER_SUBTOTAL',
			},
		})

		expect(created.status).toBe('DRAFT')
		expect(created.visibility).toBe('PRIVATE')
		expect(created.priority).toBe(0)
		expect(created.isStackable).toBe(false)
		expect(created.conditions).toEqual([])
		expect(created.benefits).toEqual([])
		expect(created.publicHighlight).toBeNull()
		expect(created.startsAt).toBeNull()
		expect(created.endsAt).toBeNull()
	})

	test('deleting a store cascades to its promotions and curated home offers', async () => {
		const store = await createStore('cascade')
		const promotion = await prisma.promotion.create({
			data: {
				storeId: store.id,
				name: 'Cascade',
				channels: ['ECOMMERCE'],
				targetScope: 'SHIPPING',
			},
		})
		await prisma.curatedHomeOffer.create({
			data: { storeId: store.id, promotionId: promotion.id, position: 1 },
		})

		await prisma.store.delete({ where: { id: store.id } })

		expect(await prisma.promotion.count({ where: { storeId: store.id } })).toBe(0)
		expect(await prisma.curatedHomeOffer.count({ where: { storeId: store.id } })).toBe(0)
	})

	test('a curated home offer can only reference a promotion from the same store', async () => {
		const storeA = await createStore('home-a')
		const storeB = await createStore('home-b')

		const promotionB = await prisma.promotion.create({
			data: {
				storeId: storeB.id,
				name: 'Oferta da Loja B',
				status: 'ACTIVE',
				visibility: 'PUBLIC',
				channels: ['ECOMMERCE'],
				targetScope: 'ELIGIBLE_ITEMS',
			},
		})

		await expect(
			prisma.curatedHomeOffer.create({
				data: { storeId: storeA.id, promotionId: promotionB.id, position: 1 },
			}),
		).rejects.toMatchObject({ code: 'P2003' })

		const promotionA = await prisma.promotion.create({
			data: {
				storeId: storeA.id,
				name: 'Oferta da Loja A',
				status: 'ACTIVE',
				visibility: 'PUBLIC',
				channels: ['ECOMMERCE'],
				targetScope: 'ELIGIBLE_ITEMS',
			},
		})

		await expect(
			prisma.curatedHomeOffer.create({
				data: { storeId: storeA.id, promotionId: promotionA.id, position: 1 },
			}),
		).resolves.toMatchObject({ position: 1 })
	})

	test('curated home offer position is unique per store', async () => {
		const store = await createStore('home-position')
		const [promoOne, promoTwo] = await Promise.all([
			prisma.promotion.create({
				data: {
					storeId: store.id,
					name: 'Promo 1',
					channels: ['ECOMMERCE'],
					targetScope: 'ELIGIBLE_ITEMS',
				},
			}),
			prisma.promotion.create({
				data: {
					storeId: store.id,
					name: 'Promo 2',
					channels: ['ECOMMERCE'],
					targetScope: 'ELIGIBLE_ITEMS',
				},
			}),
		])

		await prisma.curatedHomeOffer.create({
			data: { storeId: store.id, promotionId: promoOne.id, position: 1 },
		})

		await expect(
			prisma.curatedHomeOffer.create({
				data: { storeId: store.id, promotionId: promoTwo.id, position: 1 },
			}),
		).rejects.toMatchObject({ code: 'P2002' })
	})
})
