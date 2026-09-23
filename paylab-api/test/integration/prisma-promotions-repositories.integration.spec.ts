import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CuratedHomeOffer } from '@/domain/quintalpet/enterprise/entities/curated-home-offer'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCuratedHomeOffersRepository } from '@/infra/database/prisma/repositories/promotions/prisma-curated-home-offers-repository'
import { PrismaPromotionsRepository } from '@/infra/database/prisma/repositories/promotions/prisma-promotions-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const promotionsRepository = new PrismaPromotionsRepository(prisma)
const curatedHomeOffersRepository = new PrismaCuratedHomeOffersRepository(prisma)

async function resetDatabase() {
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

async function createStore(suffix: string) {
	return prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-promo-repo-${suffix}` },
	})
}

function makePromotion(storeId: string, overrides: Record<string, unknown> = {}) {
	return Promotion.create({
		storeId: new UniqueEntityID(storeId),
		name: 'Campanha',
		targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
		channels: [PromotionChannel.ECOMMERCE],
		...overrides,
	})
}

describe('Prisma promotions repositories', () => {
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

	test('save + findById round-trips a promotion and is store-scoped', async () => {
		const store = await createStore('round-trip')
		const other = await createStore('other')

		const promotion = makePromotion(store.id, {
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PUBLIC,
			channels: [PromotionChannel.ECOMMERCE, PromotionChannel.PDV],
			priority: 10,
			conditions: [{ type: 'CATEGORY', categoryId: 'cat-1', includeDescendants: true }],
			benefits: [{ type: 'PERCENTAGE', percentage: 15 }],
			publicHighlight: { badge: '15% OFF' },
		})
		await promotionsRepository.save(promotion)

		const found = await promotionsRepository.findById(promotion.id.toString(), store.id)
		expect(found?.name).toBe('Campanha')
		expect(found?.channels).toEqual([PromotionChannel.ECOMMERCE, PromotionChannel.PDV])
		expect(found?.benefits).toEqual([{ type: 'PERCENTAGE', percentage: 15 }])
		expect(found?.publicHighlight?.badge).toBe('15% OFF')

		expect(await promotionsRepository.findById(promotion.id.toString(), other.id)).toBeNull()
	})

	test('save also updates an existing promotion', async () => {
		const store = await createStore('update')
		const promotion = makePromotion(store.id)
		await promotionsRepository.save(promotion)

		promotion.update({ name: 'Renomeada', priority: 5 })
		await promotionsRepository.save(promotion)

		const found = await promotionsRepository.findById(promotion.id.toString(), store.id)
		expect(found?.name).toBe('Renomeada')
		expect(found?.priority).toBe(5)
	})

	test('listByStore filters by status/channel and paginates', async () => {
		const store = await createStore('list')
		await promotionsRepository.save(
			makePromotion(store.id, { name: 'A', status: PromotionStatus.ACTIVE, priority: 3 }),
		)
		await promotionsRepository.save(
			makePromotion(store.id, { name: 'B', status: PromotionStatus.DRAFT, priority: 2 }),
		)
		await promotionsRepository.save(
			makePromotion(store.id, {
				name: 'C',
				status: PromotionStatus.ACTIVE,
				priority: 1,
				channels: [PromotionChannel.PDV],
			}),
		)

		const active = await promotionsRepository.listByStore(store.id, {
			status: PromotionStatus.ACTIVE,
			page: 1,
			perPage: 10,
		})
		expect(active.total).toBe(2)
		expect(active.items.map((item) => item.name)).toEqual(['A', 'C'])

		const ecommerce = await promotionsRepository.listByStore(store.id, {
			channel: PromotionChannel.ECOMMERCE,
			page: 1,
			perPage: 10,
		})
		expect(ecommerce.total).toBe(2)

		const firstPage = await promotionsRepository.listByStore(store.id, { page: 1, perPage: 2 })
		expect(firstPage.items).toHaveLength(2)
		expect(firstPage.total).toBe(3)
	})

	test('listActiveForChannel excludes drafts, wrong channel, and out-of-window rows, ordered by priority', async () => {
		const store = await createStore('active')
		const now = new Date('2026-09-15T12:00:00Z')

		await promotionsRepository.save(
			makePromotion(store.id, { name: 'high', status: PromotionStatus.ACTIVE, priority: 10 }),
		)
		await promotionsRepository.save(
			makePromotion(store.id, { name: 'low', status: PromotionStatus.ACTIVE, priority: 1 }),
		)
		await promotionsRepository.save(
			makePromotion(store.id, { name: 'draft', status: PromotionStatus.DRAFT, priority: 99 }),
		)
		await promotionsRepository.save(
			makePromotion(store.id, {
				name: 'pdv-only',
				status: PromotionStatus.ACTIVE,
				priority: 50,
				channels: [PromotionChannel.PDV],
			}),
		)
		await promotionsRepository.save(
			makePromotion(store.id, {
				name: 'expired',
				status: PromotionStatus.ACTIVE,
				priority: 50,
				startsAt: new Date('2026-08-01T00:00:00Z'),
				endsAt: new Date('2026-08-31T00:00:00Z'),
			}),
		)

		const result = await promotionsRepository.listActiveForChannel(
			store.id,
			PromotionChannel.ECOMMERCE,
			{ at: now },
		)
		expect(result.map((item) => item.name)).toEqual(['high', 'low'])
	})

	test('curated home offers replace + list are store-scoped and ordered', async () => {
		const store = await createStore('home')
		const promoOne = makePromotion(store.id, {
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PUBLIC,
		})
		const promoTwo = makePromotion(store.id, {
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PUBLIC,
		})
		await promotionsRepository.save(promoOne)
		await promotionsRepository.save(promoTwo)

		await curatedHomeOffersRepository.replaceForStore(store.id, [
			CuratedHomeOffer.create({
				storeId: new UniqueEntityID(store.id),
				promotionId: promoTwo.id,
				position: 1,
			}),
			CuratedHomeOffer.create({
				storeId: new UniqueEntityID(store.id),
				promotionId: promoOne.id,
				position: 2,
			}),
		])

		let offers = await curatedHomeOffersRepository.listByStore(store.id)
		expect(offers.map((offer) => offer.promotionId.toString())).toEqual([
			promoTwo.id.toString(),
			promoOne.id.toString(),
		])

		await curatedHomeOffersRepository.replaceForStore(store.id, [
			CuratedHomeOffer.create({
				storeId: new UniqueEntityID(store.id),
				promotionId: promoOne.id,
				position: 1,
			}),
		])
		offers = await curatedHomeOffersRepository.listByStore(store.id)
		expect(offers).toHaveLength(1)
		expect(offers[0].promotionId.toString()).toBe(promoOne.id.toString())

		await curatedHomeOffersRepository.removeByPromotionId(promoOne.id.toString(), store.id)
		expect(await curatedHomeOffersRepository.listByStore(store.id)).toHaveLength(0)
	})
})
