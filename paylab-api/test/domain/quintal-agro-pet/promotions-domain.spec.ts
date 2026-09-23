import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import { InvalidPromotionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-error'
import { InvalidPromotionPayloadError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-payload-error'
import { InvalidPromotionTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-transition-error'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { describe, expect, test } from 'vitest'

function makePromotion(overrides: Record<string, unknown> = {}) {
	return Promotion.create({
		storeId: new UniqueEntityID('store-1'),
		name: 'Campanha',
		targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
		channels: [PromotionChannel.ECOMMERCE],
		...overrides,
	})
}

describe('Promotion — validity window', () => {
	test('is always-on when both bounds are null', () => {
		const promotion = makePromotion()
		expect(promotion.isWithinValidityWindow(new Date('2020-01-01'))).toBe(true)
		expect(promotion.isWithinValidityWindow(new Date('2999-01-01'))).toBe(true)
	})

	test('respects start and end bounds', () => {
		const promotion = makePromotion({
			startsAt: new Date('2026-09-01T00:00:00Z'),
			endsAt: new Date('2026-09-30T23:59:59Z'),
		})
		expect(promotion.isWithinValidityWindow(new Date('2026-08-31T23:59:59Z'))).toBe(false)
		expect(promotion.isWithinValidityWindow(new Date('2026-09-15T12:00:00Z'))).toBe(true)
		expect(promotion.isWithinValidityWindow(new Date('2026-10-01T00:00:00Z'))).toBe(false)
	})

	test('isActiveAt requires ACTIVE status and an in-window instant', () => {
		const draft = makePromotion()
		expect(draft.isActiveAt()).toBe(false)

		const active = makePromotion({ status: PromotionStatus.ACTIVE })
		expect(active.isActiveAt()).toBe(true)
	})

	test('rejects a window whose start is after its end', () => {
		expect(() =>
			makePromotion({ startsAt: new Date('2026-10-01'), endsAt: new Date('2026-09-01') }),
		).toThrow(InvalidPromotionError)
	})
})

describe('Promotion — channel eligibility', () => {
	test('only opted-in channels are allowed', () => {
		const promotion = makePromotion({ channels: [PromotionChannel.PDV] })
		expect(promotion.allowsChannel(PromotionChannel.PDV)).toBe(true)
		expect(promotion.allowsChannel(PromotionChannel.ECOMMERCE)).toBe(false)
	})

	test('requires at least one channel', () => {
		expect(() => makePromotion({ channels: [] })).toThrow(InvalidPromotionError)
	})
})

describe('Promotion — public vs coupon-only visibility', () => {
	test('a private promotion is never publicly discoverable', () => {
		const promotion = makePromotion({
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PRIVATE,
		})
		expect(promotion.isEligibleForPublicDiscovery()).toBe(false)
	})

	test('a public promotion with a coupon condition stays hidden from discovery', () => {
		const promotion = makePromotion({
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PUBLIC,
			conditions: [{ type: 'COUPON', code: ' verao10 ' }],
		})
		expect(promotion.isCouponOnly()).toBe(true)
		expect(promotion.couponCode()).toBe('VERAO10')
		expect(promotion.isEligibleForPublicDiscovery()).toBe(false)
	})

	test('a public automatic active promotion is discoverable', () => {
		const promotion = makePromotion({
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PUBLIC,
		})
		expect(promotion.isEligibleForPublicDiscovery()).toBe(true)
	})
})

describe('Promotion — category descendant targeting metadata', () => {
	test('defaults includeDescendants to true (full subtree)', () => {
		const promotion = makePromotion({
			conditions: [{ type: 'CATEGORY', categoryId: 'cat-1' }],
		})
		expect(promotion.categoryConditionIds()).toEqual([
			{ categoryId: 'cat-1', includeDescendants: true },
		])
	})

	test('honors an explicit includeDescendants: false', () => {
		const promotion = makePromotion({
			conditions: [{ type: 'CATEGORY', categoryId: 'cat-1', includeDescendants: false }],
		})
		expect(promotion.categoryConditionIds()).toEqual([
			{ categoryId: 'cat-1', includeDescendants: false },
		])
	})
})

describe('Promotion — typed condition/benefit payload validation', () => {
	test('rejects an unknown condition type', () => {
		expect(() => makePromotion({ conditions: [{ type: 'NONSENSE' }] })).toThrow(
			InvalidPromotionPayloadError,
		)
	})

	test('rejects a non-positive MIN_ELIGIBLE_QUANTITY', () => {
		expect(() =>
			makePromotion({ conditions: [{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 0 }] }),
		).toThrow(InvalidPromotionPayloadError)
	})

	test('rejects a percentage benefit outside (0, 100]', () => {
		expect(() => makePromotion({ benefits: [{ type: 'PERCENTAGE', percentage: 150 }] })).toThrow(
			InvalidPromotionPayloadError,
		)
	})

	test('rejects BUY_X_PAY_Y where payQuantity is not less than buyQuantity', () => {
		expect(() =>
			makePromotion({ benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 2, payQuantity: 2 }] }),
		).toThrow(InvalidPromotionPayloadError)
	})

	test('accepts and normalizes a valid payload set', () => {
		const promotion = makePromotion({
			conditions: [
				{ type: 'CATEGORY', categoryId: 'cat-sachets', includeDescendants: true },
				{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 3 },
			],
			benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }],
			publicHighlight: {
				badge: 'Leve 3 pague 2',
				projectedPack: { quantity: 3, priceCents: 6000 },
			},
		})
		expect(promotion.benefits).toEqual([{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }])
		expect(promotion.publicHighlight?.projectedPack).toEqual({ quantity: 3, priceCents: 6000 })
	})
})

describe('Promotion — status transitions', () => {
	test('DRAFT can move to ACTIVE and back to INACTIVE', () => {
		const promotion = makePromotion()
		promotion.activate()
		expect(promotion.status).toBe(PromotionStatus.ACTIVE)
		promotion.deactivate()
		expect(promotion.status).toBe(PromotionStatus.INACTIVE)
	})

	test('ARCHIVED is terminal', () => {
		const promotion = makePromotion()
		promotion.archive()
		expect(() => promotion.activate()).toThrow(InvalidPromotionTransitionError)
	})

	test('an archived promotion cannot be edited', () => {
		const promotion = makePromotion()
		promotion.archive()
		expect(() => promotion.update({ name: 'x' })).toThrow(InvalidPromotionError)
	})
})
