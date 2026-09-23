import { CatalogCategoriesRepository } from '@/domain/quintalpet/application/repositories/catalog-categories-repository'
import { CuratedHomeOffersRepository } from '@/domain/quintalpet/application/repositories/curated-home-offers-repository'
import { PromotionsRepository } from '@/domain/quintalpet/application/repositories/promotions-repository'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { PromotionBenefitType } from '@/domain/quintalpet/enterprise/value-objects/promotion-benefits'
import { PromotionConditionType } from '@/domain/quintalpet/enterprise/value-objects/promotion-conditions'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common'

export type PromotionDiscoverySurface = 'PRODUCT' | 'CATEGORY' | 'HOME' | 'CART'

export interface DiscoverPromotionsInput {
	storeSlug?: string
	surface: PromotionDiscoverySurface
	productSlug?: string
	categorySlug?: string
	now?: Date
}

export interface PromotionPackProjectionView {
	packQuantity: number
	paidQuantity: number
	unitPriceCents: number
	packTotalCents: number
	impliedUnitPriceCents: number
}

export interface PromotionHighlightView {
	id: string
	headline: string
	description: string | null
	badgeLabel: string | null
	benefitType: PromotionBenefitType
	priority: number
	packProjection: PromotionPackProjectionView | null
}

export interface PromotionDiscoveryView {
	surface: PromotionDiscoverySurface
	highlights: PromotionHighlightView[]
}

/** The frontend contract caps discovery at two highlights per surface. */
export const MAX_HIGHLIGHTS_PER_SURFACE = 2

@Injectable()
export class DiscoverPromotionsUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly promotionsRepository: PromotionsRepository,
		private readonly curatedHomeOffersRepository: CuratedHomeOffersRepository,
		private readonly categoriesRepository: CatalogCategoriesRepository,
	) {}

	async execute(input: DiscoverPromotionsInput): Promise<PromotionDiscoveryView> {
		const now = input.now ?? new Date()
		const store = await this.resolveStore(input.storeSlug)

		let candidates: Promotion[]
		switch (input.surface) {
			case 'HOME':
				candidates = await this.homeCandidates(store.id)
				break
			case 'PRODUCT':
				candidates = await this.productCandidates(store.id, input.productSlug, now)
				break
			case 'CATEGORY':
				candidates = await this.categoryCandidates(store.id, input.categorySlug, now)
				break
			default:
				candidates = await this.listPublicActive(store.id, now)
		}

		const highlights = candidates
			.filter((promotion) => promotion.isEligibleForPublicDiscovery(now))
			.slice(0, MAX_HIGHLIGHTS_PER_SURFACE)
			.map((promotion) => this.toHighlight(promotion))

		return { surface: input.surface, highlights }
	}

	private async listPublicActive(storeId: string, now: Date): Promise<Promotion[]> {
		return this.promotionsRepository.listActiveForChannel(storeId, PromotionChannel.ECOMMERCE, {
			at: now,
			visibility: PromotionVisibility.PUBLIC,
		})
	}

	private async homeCandidates(storeId: string): Promise<Promotion[]> {
		const curated = await this.curatedHomeOffersRepository.listByStore(storeId)
		const promotions: Promotion[] = []
		for (const offer of curated) {
			const promotion = await this.promotionsRepository.findById(
				offer.promotionId.toString(),
				storeId,
			)
			if (promotion) promotions.push(promotion)
		}
		return promotions
	}

	private async productCandidates(
		storeId: string,
		productSlug: string | undefined,
		now: Date,
	): Promise<Promotion[]> {
		if (!productSlug) {
			throw new BadRequestException('productSlug is required for PRODUCT discovery.')
		}
		const product = await this.prisma.product.findFirst({
			where: { storeId, slug: productSlug },
			select: {
				id: true,
				primaryCategoryId: true,
				categories: { select: { categoryId: true } },
			},
		})
		if (!product) {
			throw new NotFoundException('Storefront product not found.')
		}

		const directCategoryIds = new Set<string>()
		if (product.primaryCategoryId) directCategoryIds.add(product.primaryCategoryId)
		for (const assignment of product.categories) directCategoryIds.add(assignment.categoryId)

		const membership = new Set<string>(directCategoryIds)
		for (const categoryId of directCategoryIds) {
			for (const ancestorId of await this.categoriesRepository.listAncestorIds(
				categoryId,
				storeId,
			)) {
				membership.add(ancestorId)
			}
		}

		const active = await this.listPublicActive(storeId, now)
		return active.filter((promotion) => {
			const { productIds, categoryIds, scoped } = this.conditionTargets(promotion)
			if (!scoped) return true
			if (productIds.has(product.id)) return true
			return [...categoryIds].some((categoryId) => membership.has(categoryId))
		})
	}

	private async categoryCandidates(
		storeId: string,
		categorySlug: string | undefined,
		now: Date,
	): Promise<Promotion[]> {
		if (!categorySlug) {
			throw new BadRequestException('categorySlug is required for CATEGORY discovery.')
		}
		const category = await this.prisma.category.findFirst({
			where: { storeId, slug: categorySlug },
			select: { id: true },
		})
		if (!category) {
			throw new NotFoundException('Storefront category not found.')
		}

		const membership = new Set<string>([category.id])
		for (const ancestorId of await this.categoriesRepository.listAncestorIds(
			category.id,
			storeId,
		)) {
			membership.add(ancestorId)
		}
		for (const descendantId of await this.categoriesRepository.listDescendantIds(
			category.id,
			storeId,
		)) {
			membership.add(descendantId)
		}

		const active = await this.listPublicActive(storeId, now)
		return active.filter((promotion) => {
			const { categoryIds, productIds, scoped } = this.conditionTargets(promotion)
			if (!scoped) return true
			if (productIds.size > 0 && categoryIds.size === 0) return false
			return [...categoryIds].some((categoryId) => membership.has(categoryId))
		})
	}

	private conditionTargets(promotion: Promotion): {
		productIds: Set<string>
		categoryIds: Set<string>
		scoped: boolean
	} {
		const productIds = new Set<string>()
		const categoryIds = new Set<string>()
		for (const condition of promotion.conditions) {
			if (condition.type === PromotionConditionType.PRODUCT) productIds.add(condition.productId)
			if (condition.type === PromotionConditionType.CATEGORY) categoryIds.add(condition.categoryId)
		}
		return { productIds, categoryIds, scoped: productIds.size > 0 || categoryIds.size > 0 }
	}

	private toHighlight(promotion: Promotion): PromotionHighlightView {
		const benefit = promotion.benefits[0]
		const badge = promotion.publicHighlight?.badge ?? null
		const projectedPack = promotion.publicHighlight?.projectedPack ?? null

		let packProjection: PromotionPackProjectionView | null = null
		if (
			projectedPack &&
			benefit?.type === PromotionBenefitType.BUY_X_PAY_Y &&
			benefit.payQuantity > 0
		) {
			const packQuantity = benefit.buyQuantity
			const paidQuantity = benefit.payQuantity
			const packTotalCents = projectedPack.priceCents
			packProjection = {
				packQuantity,
				paidQuantity,
				unitPriceCents: Math.round(packTotalCents / paidQuantity),
				packTotalCents,
				impliedUnitPriceCents: Math.round(packTotalCents / packQuantity),
			}
		}

		return {
			id: promotion.id.toString(),
			headline: badge ?? promotion.name,
			description: badge ? promotion.name : null,
			badgeLabel: badge,
			benefitType: benefit?.type ?? PromotionBenefitType.PERCENTAGE,
			priority: promotion.priority,
			packProjection,
		}
	}

	private async resolveStore(storeSlug?: string): Promise<{ id: string; slug: string }> {
		if (storeSlug) {
			const store = await this.prisma.store.findUnique({
				where: { slug: storeSlug },
				select: { id: true, slug: true },
			})
			if (!store) throw new NotFoundException('Store not found.')
			return store
		}
		const stores = await this.prisma.store.findMany({
			select: { id: true, slug: true },
			orderBy: { createdAt: 'asc' },
			take: 2,
		})
		if (stores.length === 1) return stores[0]
		throw new NotFoundException('Store not found.')
	}
}
