import { CatalogCategoriesRepository } from '@/domain/quintalpet/application/repositories/catalog-categories-repository'
import { PromotionsRepository } from '@/domain/quintalpet/application/repositories/promotions-repository'
import {
	EngineAppliedPromotion,
	EngineCoupon,
	EngineIncentive,
	EngineLineDiscount,
	EnginePromotion,
	PricingEngineLine,
	PromotionPricingEngine,
} from '@/domain/quintalpet/enterprise/services/promotion-pricing-engine'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { CatalogVariantStatus } from '@prisma/client'

export interface QuotePromotionsItemInput {
	variantId: string
	quantity: number
}

export interface QuotePromotionsInput {
	storeSlug?: string
	items: QuotePromotionsItemInput[]
	channel: PromotionChannel
	couponCode?: string | null
	deliveryOptionId?: string | null
	shippingBaseCents?: number | null
	now?: Date
}

/**
 * Wire shape of `POST /api/v1/storefront/promotions/quote`. Field names are
 * aligned to the frontend `PromotionQuote` type (`types/commerce.ts`): the
 * canonical name for the aggregate item discount on this wire format is
 * `itemDiscountCents` (the persisted order column stays `itemDiscountTotalCents`,
 * internal to T5).
 */
export interface QuotePromotionsResult {
	baseSubtotalCents: number
	itemDiscountCents: number
	subtotalCents: number
	shippingBaseCents: number
	shippingDiscountCents: number
	shippingCents: number
	totalDiscountCents: number
	totalCents: number
	appliedPromotions: EngineAppliedPromotion[]
	incentives: EngineIncentive[]
	coupon: EngineCoupon
	lineDiscounts: EngineLineDiscount[]
}

@Injectable()
export class QuotePromotionsUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly promotionsRepository: PromotionsRepository,
		private readonly categoriesRepository: CatalogCategoriesRepository,
	) {}

	async execute(input: QuotePromotionsInput): Promise<QuotePromotionsResult> {
		const store = await this.resolveStore(input.storeSlug)
		return this.runForStore(store.id, input)
	}

	/**
	 * Same engine as `execute`, for callers that already hold a resolved store id
	 * (e.g. `PlaceOrderUseCase` recomputing server-side at order placement).
	 */
	async executeForStoreId(
		storeId: string,
		input: Omit<QuotePromotionsInput, 'storeSlug'>,
	): Promise<QuotePromotionsResult> {
		return this.runForStore(storeId, input)
	}

	private async runForStore(
		storeId: string,
		input: Omit<QuotePromotionsInput, 'storeSlug'>,
	): Promise<QuotePromotionsResult> {
		const now = input.now ?? new Date()
		const channel = input.channel

		const lines = await this.resolveLines(storeId, input.items)

		const shippingBaseCents =
			channel === PromotionChannel.PDV ? 0 : Math.max(0, input.shippingBaseCents ?? 0)

		const promotions = await this.promotionsRepository.listActiveForChannel(storeId, channel, {
			at: now,
		})

		const enginePromotions: EnginePromotion[] = []
		for (const promotion of promotions) {
			const categoryMatchIds = new Set<string>()
			for (const target of promotion.categoryConditionIds()) {
				categoryMatchIds.add(target.categoryId)
				if (target.includeDescendants) {
					for (const descendantId of await this.categoriesRepository.listDescendantIds(
						target.categoryId,
						storeId,
					)) {
						categoryMatchIds.add(descendantId)
					}
				}
			}
			enginePromotions.push({ promotion, categoryMatchIds: [...categoryMatchIds] })
		}

		const result = PromotionPricingEngine.quote({
			lines,
			channel,
			couponCode: input.couponCode ?? null,
			deliveryMethod: input.deliveryOptionId ?? null,
			shippingBaseCents,
			promotions: enginePromotions,
			now,
		})

		return {
			baseSubtotalCents: result.baseSubtotalCents,
			itemDiscountCents: result.itemDiscountCents,
			subtotalCents: result.subtotalCents,
			shippingBaseCents: result.shippingBaseCents,
			shippingDiscountCents: result.shippingDiscountCents,
			shippingCents: result.shippingCents,
			totalDiscountCents: result.totalDiscountCents,
			totalCents: result.totalCents,
			appliedPromotions: result.appliedPromotions,
			incentives: result.incentives,
			coupon: result.coupon,
			lineDiscounts: result.lineDiscounts,
		}
	}

	private async resolveLines(
		storeId: string,
		items: QuotePromotionsItemInput[],
	): Promise<PricingEngineLine[]> {
		const wanted = new Map<string, number>()
		for (const item of items) {
			if (!item?.variantId || !Number.isInteger(item.quantity) || item.quantity <= 0) continue
			wanted.set(item.variantId, (wanted.get(item.variantId) ?? 0) + item.quantity)
		}
		if (wanted.size === 0) return []

		const variants = await this.prisma.productVariant.findMany({
			where: {
				storeId,
				id: { in: [...wanted.keys()] },
				status: CatalogVariantStatus.ACTIVE,
			},
			select: {
				id: true,
				priceCents: true,
				productId: true,
				product: {
					select: {
						primaryCategoryId: true,
						categories: { select: { categoryId: true } },
					},
				},
			},
		})

		const lines: PricingEngineLine[] = []
		for (const variant of variants) {
			const directCategoryIds = new Set<string>()
			if (variant.product.primaryCategoryId) {
				directCategoryIds.add(variant.product.primaryCategoryId)
			}
			for (const assignment of variant.product.categories) {
				directCategoryIds.add(assignment.categoryId)
			}
			const categoryIds = new Set<string>(directCategoryIds)
			for (const categoryId of directCategoryIds) {
				for (const ancestorId of await this.categoriesRepository.listAncestorIds(
					categoryId,
					storeId,
				)) {
					categoryIds.add(ancestorId)
				}
			}

			lines.push({
				variantId: variant.id,
				productId: variant.productId,
				categoryIds: [...categoryIds],
				quantity: wanted.get(variant.id) ?? 0,
				unitPriceCents: variant.priceCents,
			})
		}

		// Deterministic order: follow the request order.
		const requestOrder = [...wanted.keys()]
		return lines.sort(
			(a, b) => requestOrder.indexOf(a.variantId) - requestOrder.indexOf(b.variantId),
		)
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
