import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import {
	EnginePromotion,
	PricingEngineLine,
	PromotionPricingEngine,
} from '@/domain/quintalpet/enterprise/services/promotion-pricing-engine'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'

let seq = 0

function promo(
	overrides: Record<string, unknown>,
	categoryMatchIds: string[] = [],
): EnginePromotion {
	seq += 1
	const promotion = Promotion.create(
		{
			storeId: new UniqueEntityID('store-1'),
			name: `Promo ${seq}`,
			status: PromotionStatus.ACTIVE,
			visibility: PromotionVisibility.PUBLIC,
			channels: [PromotionChannel.ECOMMERCE, PromotionChannel.PDV],
			targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
			priority: 0,
			isStackable: false,
			...overrides,
		},
		new UniqueEntityID(`promo-${seq}`),
	)
	return { promotion, categoryMatchIds }
}

function line(overrides: Partial<PricingEngineLine> = {}): PricingEngineLine {
	return {
		variantId: 'v1',
		productId: 'p1',
		categoryIds: ['c1'],
		quantity: 1,
		unitPriceCents: 1000,
		...overrides,
	}
}

const ctx = (over: Partial<Parameters<typeof PromotionPricingEngine.quote>[0]>) => ({
	lines: [],
	channel: PromotionChannel.ECOMMERCE,
	couponCode: null,
	deliveryMethod: null,
	shippingBaseCents: 0,
	promotions: [],
	...over,
})

describe('PromotionPricingEngine', () => {
	it('returns a zero quote when there are no promotions', () => {
		const result = PromotionPricingEngine.quote(
			ctx({ lines: [line({ quantity: 2 })], shippingBaseCents: 500 }),
		)
		expect(result.baseSubtotalCents).toBe(2000)
		expect(result.itemDiscountCents).toBe(0)
		expect(result.totalCents).toBe(2500)
		expect(result.appliedPromotions).toHaveLength(0)
	})

	it('applies a percentage discount to eligible items only', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [
					line({ variantId: 'a', productId: 'pa', quantity: 2, unitPriceCents: 1000 }),
					line({
						variantId: 'b',
						productId: 'pb',
						categoryIds: ['other'],
						quantity: 1,
						unitPriceCents: 3000,
					}),
				],
				promotions: [
					promo({
						targetScope: PromotionTargetScope.ELIGIBLE_ITEMS,
						conditions: [{ type: 'PRODUCT', productId: 'pa' }],
						benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
					}),
				],
			}),
		)
		expect(result.itemDiscountCents).toBe(200)
		expect(result.lineDiscounts).toEqual([{ variantId: 'a', discountCents: 200 }])
		expect(result.subtotalCents).toBe(4800)
	})

	it('evaluates MIN_CART_VALUE against the gross pre-discount subtotal', () => {
		const promotions = [
			promo({
				priority: 20,
				conditions: [{ type: 'MIN_CART_VALUE', amountCents: 5000 }],
				benefits: [{ type: 'PERCENTAGE', percentage: 50 }],
				isStackable: true,
			}),
			promo({
				priority: 10,
				conditions: [{ type: 'MIN_CART_VALUE', amountCents: 5000 }],
				benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
				isStackable: true,
			}),
		]
		const result = PromotionPricingEngine.quote(
			ctx({ lines: [line({ quantity: 5, unitPriceCents: 1000 })], promotions }),
		)
		// Both gate on the 5000 gross subtotal; the first cutting 50% must not
		// drop the second below its threshold.
		expect(result.appliedPromotions).toHaveLength(2)
	})

	it('BUY_X_PAY_Y with only PRODUCT conditions needs two units of the SAME product', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [
					line({
						variantId: 'bebedouro',
						productId: 'p-bebedouro',
						quantity: 1,
						unitPriceCents: 8990,
					}),
					line({ variantId: 'luva', productId: 'p-luva', quantity: 1, unitPriceCents: 3990 }),
				],
				promotions: [
					promo({
						conditions: [
							{ type: 'PRODUCT', productId: 'p-bebedouro' },
							{ type: 'PRODUCT', productId: 'p-luva' },
						],
						benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 2, payQuantity: 1 }],
					}),
				],
			}),
		)
		// one unit of each different product -> no pair of the same product -> nothing free
		expect(result.itemDiscountCents).toBe(0)
		expect(result.lineDiscounts).toEqual([])
	})

	it('BUY_X_PAY_Y with only PRODUCT conditions frees one unit per same-product pair', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [
					line({
						variantId: 'bebedouro',
						productId: 'p-bebedouro',
						quantity: 2,
						unitPriceCents: 8990,
					}),
					line({ variantId: 'luva', productId: 'p-luva', quantity: 3, unitPriceCents: 3990 }),
				],
				promotions: [
					promo({
						conditions: [
							{ type: 'PRODUCT', productId: 'p-bebedouro' },
							{ type: 'PRODUCT', productId: 'p-luva' },
						],
						benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 2, payQuantity: 1 }],
					}),
				],
			}),
		)
		// bebedouro: 2 units -> 1 free (8990). luva: 3 units -> 1 free (3990). pooled would free 2 units total = 7980.
		expect(result.itemDiscountCents).toBe(8990 + 3990)
		const byId = Object.fromEntries(result.lineDiscounts.map((d) => [d.variantId, d.discountCents]))
		expect(byId).toEqual({ bebedouro: 8990, luva: 3990 })
	})

	it('groups mixed eligible lines for BUY_X_PAY_Y and frees the cheapest units', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [
					line({
						variantId: 'frango',
						productId: 'pf',
						categoryIds: ['sache'],
						quantity: 2,
						unitPriceCents: 500,
					}),
					line({
						variantId: 'carne',
						productId: 'pc',
						categoryIds: ['sache'],
						quantity: 1,
						unitPriceCents: 700,
					}),
				],
				promotions: [
					promo(
						{
							conditions: [
								{ type: 'CATEGORY', categoryId: 'sache', includeDescendants: true },
								{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 3 },
							],
							benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }],
						},
						['sache'],
					),
				],
			}),
		)
		// 3 units -> 1 free -> cheapest unit (500).
		expect(result.itemDiscountCents).toBe(500)
		expect(result.lineDiscounts).toEqual([{ variantId: 'frango', discountCents: 500 }])
	})

	it('allocates a fixed amount proportionally across eligible lines', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [
					line({ variantId: 'a', productId: 'pa', quantity: 1, unitPriceCents: 1000 }),
					line({ variantId: 'b', productId: 'pb', quantity: 1, unitPriceCents: 3000 }),
				],
				promotions: [
					promo({
						targetScope: PromotionTargetScope.ORDER_SUBTOTAL,
						conditions: [],
						benefits: [{ type: 'FIXED_AMOUNT', amountCents: 400 }],
					}),
				],
			}),
		)
		expect(result.itemDiscountCents).toBe(400)
		const byId = Object.fromEntries(result.lineDiscounts.map((d) => [d.variantId, d.discountCents]))
		expect(byId).toEqual({ a: 100, b: 300 })
	})

	it('lets a non-stackable promotion block a lower-priority one on overlapping lines', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [line({ quantity: 1, unitPriceCents: 1000 })],
				promotions: [
					promo({
						priority: 20,
						isStackable: false,
						conditions: [],
						benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
					}),
					promo({
						priority: 10,
						isStackable: false,
						conditions: [],
						benefits: [{ type: 'PERCENTAGE', percentage: 50 }],
					}),
				],
			}),
		)
		expect(result.appliedPromotions).toHaveLength(1)
		expect(result.itemDiscountCents).toBe(100)
	})

	it('stacks two stackable promotions on the same line', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [line({ quantity: 1, unitPriceCents: 1000 })],
				promotions: [
					promo({
						priority: 20,
						isStackable: true,
						conditions: [],
						benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
					}),
					promo({
						priority: 10,
						isStackable: true,
						conditions: [],
						benefits: [{ type: 'FIXED_AMOUNT', amountCents: 100 }],
					}),
				],
			}),
		)
		expect(result.itemDiscountCents).toBe(200)
	})

	it('discounts the resolved shipping base to zero for FREE_SHIPPING, never negative', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [line({ quantity: 3, unitPriceCents: 10000 })],
				shippingBaseCents: 1990,
				promotions: [
					promo({
						targetScope: PromotionTargetScope.SHIPPING,
						conditions: [{ type: 'MIN_CART_VALUE', amountCents: 20000 }],
						benefits: [{ type: 'FREE_SHIPPING' }],
					}),
				],
			}),
		)
		expect(result.shippingDiscountCents).toBe(1990)
		expect(result.shippingCents).toBe(0)
		expect(result.totalDiscountCents).toBe(1990)
	})

	it('is a no-op for FREE_SHIPPING in the PDV channel', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				channel: PromotionChannel.PDV,
				lines: [line({ quantity: 3, unitPriceCents: 10000 })],
				shippingBaseCents: 0,
				promotions: [
					promo({
						targetScope: PromotionTargetScope.SHIPPING,
						conditions: [],
						benefits: [{ type: 'FREE_SHIPPING' }],
					}),
				],
			}),
		)
		expect(result.shippingDiscountCents).toBe(0)
		expect(result.appliedPromotions).toHaveLength(0)
	})

	it('emits a free-shipping incentive when only MIN_CART_VALUE is missing', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [line({ quantity: 1, unitPriceCents: 8000 })],
				shippingBaseCents: 1500,
				promotions: [
					promo({
						targetScope: PromotionTargetScope.SHIPPING,
						conditions: [{ type: 'MIN_CART_VALUE', amountCents: 10000 }],
						benefits: [{ type: 'FREE_SHIPPING' }],
					}),
				],
			}),
		)
		expect(result.incentives).toEqual([
			expect.objectContaining({
				remainingCents: 2000,
				message: expect.stringContaining('R$ 20,00'),
			}),
		])
	})

	it('rejects an unknown coupon and applies a matching one', () => {
		const couponPromo = promo({
			visibility: PromotionVisibility.PRIVATE,
			conditions: [{ type: 'COUPON', code: 'promo10' }],
			benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
		})

		const unknown = PromotionPricingEngine.quote(
			ctx({
				lines: [line({ quantity: 1, unitPriceCents: 1000 })],
				couponCode: 'WRONG',
				promotions: [couponPromo],
			}),
		)
		expect(unknown.coupon).toEqual({
			code: 'WRONG',
			accepted: false,
			rejection: { code: 'WRONG', message: 'Cupom inválido ou expirado.' },
		})
		expect(unknown.itemDiscountCents).toBe(0)

		const ok = PromotionPricingEngine.quote(
			ctx({
				lines: [line({ quantity: 1, unitPriceCents: 1000 })],
				couponCode: ' promo10 ',
				promotions: [couponPromo],
			}),
		)
		expect(ok.coupon.accepted).toBe(true)
		expect(ok.itemDiscountCents).toBe(100)
		expect(ok.appliedPromotions[0].couponCode).toBe('PROMO10')
	})

	it('ignores an inactive promotion defensively', () => {
		const result = PromotionPricingEngine.quote(
			ctx({
				lines: [line()],
				promotions: [
					promo({
						status: PromotionStatus.ACTIVE,
						startsAt: new Date('2999-01-01'),
						conditions: [],
						benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
					}),
				],
			}),
		)
		expect(result.appliedPromotions).toHaveLength(0)
	})
})
