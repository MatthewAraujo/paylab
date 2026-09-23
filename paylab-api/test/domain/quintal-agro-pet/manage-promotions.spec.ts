import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CuratedHomeOffersRepository } from '@/domain/quintalpet/application/repositories/curated-home-offers-repository'
import {
	ListActivePromotionsOptions,
	ListPromotionsByStoreFilters,
	PromotionsRepository,
} from '@/domain/quintalpet/application/repositories/promotions-repository'
import { ManagePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/manage-promotions'
import { CuratedHomeOffer } from '@/domain/quintalpet/enterprise/entities/curated-home-offer'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { NotFoundException } from '@nestjs/common'

class InMemoryPromotionsRepository extends PromotionsRepository {
	items: Promotion[] = []

	async findById(id: string, storeId: string) {
		return (
			this.items.find((p) => p.id.toString() === id && p.storeId.toString() === storeId) ?? null
		)
	}

	async listByStore(storeId: string, filters: ListPromotionsByStoreFilters) {
		let rows = this.items.filter((p) => p.storeId.toString() === storeId)
		if (filters.status) rows = rows.filter((p) => p.status === filters.status)
		if (filters.visibility) rows = rows.filter((p) => p.visibility === filters.visibility)
		const channel = filters.channel
		if (channel) rows = rows.filter((p) => p.channels.includes(channel))
		const total = rows.length
		const start = (filters.page - 1) * filters.perPage
		return { items: rows.slice(start, start + filters.perPage), total }
	}

	async listActiveForChannel(
		storeId: string,
		channel: PromotionChannel,
		options?: ListActivePromotionsOptions,
	) {
		const at = options?.at ?? new Date()
		return this.items.filter(
			(p) => p.storeId.toString() === storeId && p.allowsChannel(channel) && p.isActiveAt(at),
		)
	}

	async save(promotion: Promotion) {
		const index = this.items.findIndex((p) => p.id.equals(promotion.id))
		if (index >= 0) this.items[index] = promotion
		else this.items.push(promotion)
	}
}

class InMemoryCuratedHomeOffersRepository extends CuratedHomeOffersRepository {
	items: CuratedHomeOffer[] = []

	async listByStore(storeId: string) {
		return this.items
			.filter((o) => o.storeId.toString() === storeId)
			.sort((a, b) => a.position - b.position)
	}

	async replaceForStore(storeId: string, offers: CuratedHomeOffer[]) {
		this.items = this.items.filter((o) => o.storeId.toString() !== storeId)
		this.items.push(...offers)
	}

	async removeByPromotionId(promotionId: string, storeId: string) {
		this.items = this.items.filter(
			(o) => !(o.promotionId.toString() === promotionId && o.storeId.toString() === storeId),
		)
	}
}

const STORE = 'store-1'

function makePromotion(overrides: Partial<Parameters<typeof Promotion.create>[0]> = {}) {
	return Promotion.create({
		storeId: new UniqueEntityID(STORE),
		name: 'Campaign',
		targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
		channels: [PromotionChannel.ECOMMERCE],
		...overrides,
	})
}

describe('ManagePromotionsUseCase', () => {
	let promotionsRepo: InMemoryPromotionsRepository
	let homeOffersRepo: InMemoryCuratedHomeOffersRepository
	let sut: ManagePromotionsUseCase

	beforeEach(() => {
		promotionsRepo = new InMemoryPromotionsRepository()
		homeOffersRepo = new InMemoryCuratedHomeOffersRepository()
		sut = new ManagePromotionsUseCase(promotionsRepo, homeOffersRepo)
	})

	it('creates a promotion as DRAFT / PRIVATE by default', async () => {
		const promotion = await sut.create({
			storeId: STORE,
			name: 'Leve 3 pague 2',
			targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
			channels: [PromotionChannel.ECOMMERCE],
			benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }],
		})

		expect(promotion.status).toBe(PromotionStatus.DRAFT)
		expect(promotion.visibility).toBe(PromotionVisibility.PRIVATE)
		expect(promotionsRepo.items).toHaveLength(1)
	})

	it('rejects an invalid benefit payload', async () => {
		await expect(
			sut.create({
				storeId: STORE,
				name: 'Bad',
				targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
				channels: [PromotionChannel.ECOMMERCE],
				benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 2, payQuantity: 3 }],
			}),
		).rejects.toThrow()
	})

	it('lists store promotions with pagination metadata and filtering', async () => {
		await promotionsRepo.save(makePromotion({ name: 'A' }))
		await promotionsRepo.save(makePromotion({ name: 'B', visibility: PromotionVisibility.PUBLIC }))

		const all = await sut.list(STORE, {})
		expect(all.total).toBe(2)
		expect(all.page).toBe(1)
		expect(all.perPage).toBe(20)

		const publicOnly = await sut.list(STORE, { visibility: PromotionVisibility.PUBLIC })
		expect(publicOnly.total).toBe(1)
	})

	it('throws NotFound for a promotion from another store', async () => {
		const foreign = Promotion.create({
			storeId: new UniqueEntityID('other-store'),
			name: 'Foreign',
			targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
			channels: [PromotionChannel.ECOMMERCE],
		})
		await promotionsRepo.save(foreign)

		await expect(sut.getById(STORE, foreign.id.toString())).rejects.toBeInstanceOf(
			NotFoundException,
		)
	})

	it('updates mutable fields', async () => {
		const promotion = makePromotion()
		await promotionsRepo.save(promotion)

		const updated = await sut.update(STORE, promotion.id.toString(), {
			name: 'Renamed',
			priority: 5,
		})

		expect(updated.name).toBe('Renamed')
		expect(updated.priority).toBe(5)
	})

	it('rejects an invalid status transition', async () => {
		const promotion = makePromotion()
		await promotionsRepo.save(promotion)
		await sut.changeStatus(STORE, promotion.id.toString(), 'archive')

		await expect(sut.changeStatus(STORE, promotion.id.toString(), 'activate')).rejects.toThrow()
	})

	it('removes a promotion from the curated home lane when it is deactivated', async () => {
		const promotion = makePromotion({ visibility: PromotionVisibility.PUBLIC })
		await promotionsRepo.save(promotion)
		await sut.changeStatus(STORE, promotion.id.toString(), 'activate')
		await sut.replaceHomeOffers(STORE, [promotion.id.toString()])
		expect((await sut.listHomeOffers(STORE)).offers).toHaveLength(1)

		await sut.changeStatus(STORE, promotion.id.toString(), 'deactivate')

		expect((await sut.listHomeOffers(STORE)).offers).toHaveLength(0)
	})

	it('curates only discovery-eligible public promotions, assigning 1-based positions', async () => {
		const publicActive = makePromotion({
			name: 'Public',
			visibility: PromotionVisibility.PUBLIC,
			status: PromotionStatus.ACTIVE,
		})
		const publicActive2 = makePromotion({
			name: 'Public2',
			visibility: PromotionVisibility.PUBLIC,
			status: PromotionStatus.ACTIVE,
		})
		await promotionsRepo.save(publicActive)
		await promotionsRepo.save(publicActive2)

		const result = await sut.replaceHomeOffers(STORE, [
			publicActive2.id.toString(),
			publicActive.id.toString(),
		])

		expect(result.offers).toEqual([
			expect.objectContaining({ promotionId: publicActive2.id.toString(), position: 1 }),
			expect.objectContaining({ promotionId: publicActive.id.toString(), position: 2 }),
		])
	})

	it('rejects a private / coupon-only / draft promotion in the curated home lane', async () => {
		const draftPublic = makePromotion({ visibility: PromotionVisibility.PUBLIC })
		await promotionsRepo.save(draftPublic)

		await expect(sut.replaceHomeOffers(STORE, [draftPublic.id.toString()])).rejects.toThrow()

		const couponOnly = makePromotion({
			visibility: PromotionVisibility.PUBLIC,
			status: PromotionStatus.ACTIVE,
			conditions: [{ type: 'COUPON', code: 'promo10' }],
		})
		await promotionsRepo.save(couponOnly)

		await expect(sut.replaceHomeOffers(STORE, [couponOnly.id.toString()])).rejects.toThrow()
	})

	it('rejects a duplicate promotion id in the curated home lane', async () => {
		const promotion = makePromotion({
			visibility: PromotionVisibility.PUBLIC,
			status: PromotionStatus.ACTIVE,
		})
		await promotionsRepo.save(promotion)

		await expect(
			sut.replaceHomeOffers(STORE, [promotion.id.toString(), promotion.id.toString()]),
		).rejects.toThrow()
	})

	it('rejects a cross-store promotion id in the curated home lane', async () => {
		await expect(sut.replaceHomeOffers(STORE, ['missing-id'])).rejects.toThrow()
	})
})
