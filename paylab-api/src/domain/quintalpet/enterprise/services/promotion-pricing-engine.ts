import { Promotion } from '../entities/promotion'
import { PromotionChannel } from '../types/promotion-channel'
import { PromotionTargetScope } from '../types/promotion-target-scope'
import { PromotionBenefit, PromotionBenefitType } from '../value-objects/promotion-benefits'
import { PromotionConditionType } from '../value-objects/promotion-conditions'

/**
 * Deterministic, side-effect-free promotion pricing engine (task T4).
 *
 * It layers promotion discounts over an ALREADY-RESOLVED pricing context:
 * catalog base unit prices (Catalog owns them) and an already-resolved shipping
 * base (Shipping owns distance / availability — ADR 0007 / 0011). The engine
 * never reads the database, never computes distance, and produces the same
 * output for the same input.
 *
 * Application order: promotions are processed by priority (desc) then creation
 * time (asc) — the order the repository already returns. A non-stackable
 * promotion that applies blocks every lower-priority promotion that overlaps its
 * target scope / lines. `MIN_CART_VALUE` is evaluated against the GROSS
 * pre-discount subtotal so one promotion cannot disable another mid-calculation.
 */

export interface PricingEngineLine {
	variantId: string
	productId: string
	/** Category ids the product belongs to, already expanded with ancestors. */
	categoryIds: string[]
	quantity: number
	unitPriceCents: number
}

export interface EnginePromotion {
	promotion: Promotion
	/**
	 * Category ids (the condition's category plus its resolved descendant
	 * subtree) that this promotion's `CATEGORY` conditions match. Resolved by the
	 * caller against the store-scoped category tree.
	 */
	categoryMatchIds: string[]
}

export interface PricingEngineContext {
	lines: PricingEngineLine[]
	channel: PromotionChannel
	couponCode: string | null
	deliveryMethod: string | null
	shippingBaseCents: number
	promotions: EnginePromotion[]
	now?: Date
}

export interface EngineAppliedPromotion {
	id: string
	name: string
	benefitType: PromotionBenefitType
	targetScope: PromotionTargetScope
	discountCents: number
	couponCode: string | null
}

export interface EngineIncentive {
	promotionId: string
	message: string
	remainingCents: number | null
}

export interface EngineLineDiscount {
	variantId: string
	discountCents: number
}

export interface EngineCouponRejection {
	code: string
	message: string
}

export interface EngineCoupon {
	code: string | null
	accepted: boolean
	rejection: EngineCouponRejection | null
}

export interface PricingEngineResult {
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
	lineDiscounts: EngineLineDiscount[]
	coupon: EngineCoupon
}

const COUPON_INVALID_MESSAGE = 'Cupom inválido ou expirado.'
const COUPON_NOT_APPLICABLE_MESSAGE = 'Cupom não aplicável a este carrinho.'

function normalizeCoupon(code: string | null): string | null {
	if (!code) return null
	const trimmed = code.trim().toUpperCase()
	return trimmed.length > 0 ? trimmed : null
}

function formatBRL(cents: number): string {
	const value = (cents / 100).toFixed(2).replace('.', ',')
	return `R$ ${value}`
}

/** Largest-remainder proportional allocation, fully deterministic by index. */
function allocateProportional(total: number, weights: number[]): number[] {
	const weightSum = weights.reduce((sum, weight) => sum + weight, 0)
	if (total <= 0 || weightSum <= 0) {
		return weights.map(() => 0)
	}
	const raw = weights.map((weight) => (total * weight) / weightSum)
	const floored = raw.map((value) => Math.floor(value))
	let remaining = total - floored.reduce((sum, value) => sum + value, 0)
	const order = raw
		.map((value, index) => ({ index, frac: value - Math.floor(value) }))
		.sort((a, b) => b.frac - a.frac || a.index - b.index)
	for (const entry of order) {
		if (remaining <= 0) break
		floored[entry.index] += 1
		remaining -= 1
	}
	return floored
}

function groupByProductId(lines: PricingEngineLine[]): Map<string, PricingEngineLine[]> {
	const groups = new Map<string, PricingEngineLine[]>()
	for (const line of lines) {
		const bucket = groups.get(line.productId)
		if (bucket) bucket.push(line)
		else groups.set(line.productId, [line])
	}
	return groups
}

interface GateResult {
	ok: boolean
	failures: string[]
	minCartRemainingCents: number | null
}

export class PromotionPricingEngine {
	static quote(context: PricingEngineContext): PricingEngineResult {
		const now = context.now ?? new Date()
		const lines = context.lines.filter((line) => line.quantity > 0 && line.unitPriceCents >= 0)

		const baseSubtotalCents = lines.reduce(
			(sum, line) => sum + line.unitPriceCents * line.quantity,
			0,
		)

		// Per-variant accumulated item discount.
		const lineDiscount = new Map<string, number>()
		for (const line of lines) lineDiscount.set(line.variantId, 0)

		let shippingDiscountCents = 0
		const blockedLineIds = new Set<string>()
		let shippingScopeClaimed = false

		const requestedCoupon = normalizeCoupon(context.couponCode)
		const applied: EngineAppliedPromotion[] = []
		const incentives: EngineIncentive[] = []

		const active = context.promotions.filter((entry) => entry.promotion.isActiveAt(now))

		for (const entry of active) {
			const { promotion } = entry
			const scope = promotion.targetScope
			const benefit = promotion.benefits[0]
			if (!benefit) continue

			const eligible = this.eligibleLines(entry, lines)
			const gate = this.evaluateGate(entry, eligible, context, baseSubtotalCents)

			// Free-shipping incentive nudge: only-missing-condition is MIN_CART_VALUE.
			if (
				!gate.ok &&
				gate.failures.length === 1 &&
				gate.failures[0] === 'MIN_CART_VALUE' &&
				gate.minCartRemainingCents !== null &&
				gate.minCartRemainingCents > 0 &&
				benefit.type === PromotionBenefitType.FREE_SHIPPING &&
				promotion.isPublic() &&
				context.channel !== PromotionChannel.PDV &&
				context.shippingBaseCents > 0
			) {
				incentives.push({
					promotionId: promotion.id.toString(),
					message: `Faltam ${formatBRL(gate.minCartRemainingCents)} para ganhar frete grátis.`,
					remainingCents: gate.minCartRemainingCents,
				})
			}

			if (!gate.ok) continue

			// Blocking by a prior non-stackable promotion.
			if (scope === PromotionTargetScope.SHIPPING) {
				if (shippingScopeClaimed) continue
			} else {
				const targetLines = scope === PromotionTargetScope.ELIGIBLE_ITEMS ? eligible : lines
				if (targetLines.some((line) => blockedLineIds.has(line.variantId))) continue
			}

			const remainingShipping = context.shippingBaseCents - shippingDiscountCents

			if (scope === PromotionTargetScope.SHIPPING) {
				const discount = this.shippingDiscount(benefit, remainingShipping, context)
				if (discount <= 0) continue
				shippingDiscountCents += discount
				applied.push(this.presentApplied(promotion, benefit, scope, discount, requestedCoupon))
				if (!promotion.isStackable) shippingScopeClaimed = true
				continue
			}

			const targetLines = scope === PromotionTargetScope.ELIGIBLE_ITEMS ? eligible : lines
			// BUY_X_PAY_Y grouping: a promotion scoped to a CATEGORY lets the
			// shopper mix any participating items ("compre 3 sachês quaisquer");
			// one scoped only to specific products requires whole packs of the
			// SAME product ("compre 2 bebedouros, leve 1").
			const mixAndMatch = promotion.conditions.some(
				(condition) => condition.type === PromotionConditionType.CATEGORY,
			)
			const perLine = this.itemDiscount(
				benefit,
				scope,
				targetLines,
				lineDiscount,
				baseSubtotalCents,
				mixAndMatch,
			)
			const totalDiscount = [...perLine.values()].reduce((sum, value) => sum + value, 0)
			if (totalDiscount <= 0) continue
			for (const [variantId, value] of perLine) {
				lineDiscount.set(variantId, (lineDiscount.get(variantId) ?? 0) + value)
			}
			applied.push(this.presentApplied(promotion, benefit, scope, totalDiscount, requestedCoupon))
			if (!promotion.isStackable) {
				for (const line of targetLines) blockedLineIds.add(line.variantId)
			}
		}

		const itemDiscountCents = [...lineDiscount.values()].reduce((sum, value) => sum + value, 0)
		const subtotalCents = baseSubtotalCents - itemDiscountCents
		const shippingBaseCents = context.shippingBaseCents
		shippingDiscountCents = Math.min(shippingDiscountCents, shippingBaseCents)
		const shippingCents = shippingBaseCents - shippingDiscountCents
		const totalDiscountCents = itemDiscountCents + shippingDiscountCents

		const lineDiscounts: EngineLineDiscount[] = lines
			.map((line) => ({
				variantId: line.variantId,
				discountCents: lineDiscount.get(line.variantId) ?? 0,
			}))
			.filter((entry) => entry.discountCents > 0)

		return {
			baseSubtotalCents,
			itemDiscountCents,
			subtotalCents,
			shippingBaseCents,
			shippingDiscountCents,
			shippingCents,
			totalDiscountCents,
			totalCents: subtotalCents + shippingCents,
			appliedPromotions: applied,
			incentives: incentives.sort((a, b) => (a.remainingCents ?? 0) - (b.remainingCents ?? 0)),
			lineDiscounts,
			coupon: this.resolveCoupon(requestedCoupon, active, applied),
		}
	}

	private static presentApplied(
		promotion: Promotion,
		benefit: PromotionBenefit,
		scope: PromotionTargetScope,
		discountCents: number,
		requestedCoupon: string | null,
	): EngineAppliedPromotion {
		const couponCode = promotion.isCouponOnly() ? (promotion.couponCode() ?? requestedCoupon) : null
		return {
			id: promotion.id.toString(),
			name: promotion.name,
			benefitType: benefit.type,
			targetScope: scope,
			discountCents,
			couponCode,
		}
	}

	private static eligibleLines(
		entry: EnginePromotion,
		lines: PricingEngineLine[],
	): PricingEngineLine[] {
		const productIds = new Set<string>()
		let hasProductOrCategory = false
		for (const condition of entry.promotion.conditions) {
			if (condition.type === PromotionConditionType.PRODUCT) {
				productIds.add(condition.productId)
				hasProductOrCategory = true
			}
			if (condition.type === PromotionConditionType.CATEGORY) {
				hasProductOrCategory = true
			}
		}
		if (!hasProductOrCategory) return lines
		const categoryMatch = new Set(entry.categoryMatchIds)
		return lines.filter(
			(line) =>
				productIds.has(line.productId) ||
				line.categoryIds.some((categoryId) => categoryMatch.has(categoryId)),
		)
	}

	private static evaluateGate(
		entry: EnginePromotion,
		eligible: PricingEngineLine[],
		context: PricingEngineContext,
		grossSubtotalCents: number,
	): GateResult {
		const failures: string[] = []
		let minCartRemainingCents: number | null = null
		let hasProductOrCategory = false

		for (const condition of entry.promotion.conditions) {
			switch (condition.type) {
				case PromotionConditionType.PRODUCT:
				case PromotionConditionType.CATEGORY:
					hasProductOrCategory = true
					break
				case PromotionConditionType.CHANNEL:
					if (condition.channel !== context.channel) failures.push('CHANNEL')
					break
				case PromotionConditionType.DELIVERY_METHOD:
					if (condition.method !== context.deliveryMethod) failures.push('DELIVERY_METHOD')
					break
				case PromotionConditionType.COUPON: {
					const requested = normalizeCoupon(context.couponCode)
					if (!requested || requested !== condition.code) failures.push('COUPON')
					break
				}
				case PromotionConditionType.MIN_ELIGIBLE_QUANTITY: {
					const quantity = eligible.reduce((sum, line) => sum + line.quantity, 0)
					if (quantity < condition.quantity) failures.push('MIN_ELIGIBLE_QUANTITY')
					break
				}
				case PromotionConditionType.MIN_CART_VALUE: {
					if (grossSubtotalCents < condition.amountCents) {
						failures.push('MIN_CART_VALUE')
						minCartRemainingCents = condition.amountCents - grossSubtotalCents
					}
					break
				}
			}
		}

		if (hasProductOrCategory && eligible.length === 0) failures.push('NO_ELIGIBLE_ITEMS')
		if (context.channel !== null && !entry.promotion.allowsChannel(context.channel)) {
			failures.push('CHANNEL')
		}

		return { ok: failures.length === 0, failures, minCartRemainingCents }
	}

	private static shippingDiscount(
		benefit: PromotionBenefit,
		remainingShipping: number,
		context: PricingEngineContext,
	): number {
		if (context.channel === PromotionChannel.PDV) return 0
		if (remainingShipping <= 0) return 0
		switch (benefit.type) {
			case PromotionBenefitType.FREE_SHIPPING:
				return remainingShipping
			case PromotionBenefitType.PERCENTAGE:
				return Math.min(
					remainingShipping,
					Math.round((remainingShipping * benefit.percentage) / 100),
				)
			case PromotionBenefitType.FIXED_AMOUNT:
				return Math.min(remainingShipping, benefit.amountCents)
			default:
				return 0
		}
	}

	private static itemDiscount(
		benefit: PromotionBenefit,
		scope: PromotionTargetScope,
		targetLines: PricingEngineLine[],
		alreadyDiscounted: Map<string, number>,
		grossSubtotalCents: number,
		mixAndMatch = true,
	): Map<string, number> {
		const result = new Map<string, number>()
		if (targetLines.length === 0) return result

		const netOf = (line: PricingEngineLine) =>
			line.unitPriceCents * line.quantity - (alreadyDiscounted.get(line.variantId) ?? 0)

		switch (benefit.type) {
			case PromotionBenefitType.PERCENTAGE: {
				if (scope === PromotionTargetScope.ORDER_SUBTOTAL) {
					const total = Math.round((grossSubtotalCents * benefit.percentage) / 100)
					const weights = targetLines.map((line) => Math.max(0, netOf(line)))
					const allocation = allocateProportional(total, weights)
					targetLines.forEach((line, index) => result.set(line.variantId, allocation[index]))
				} else {
					for (const line of targetLines) {
						const gross = line.unitPriceCents * line.quantity
						const discount = Math.min(
							Math.max(0, netOf(line)),
							Math.round((gross * benefit.percentage) / 100),
						)
						if (discount > 0) result.set(line.variantId, discount)
					}
				}
				return result
			}
			case PromotionBenefitType.FIXED_AMOUNT: {
				const weights = targetLines.map((line) => Math.max(0, netOf(line)))
				const capacity = weights.reduce((sum, weight) => sum + weight, 0)
				const total = Math.min(benefit.amountCents, capacity)
				const allocation = allocateProportional(total, weights)
				targetLines.forEach((line, index) => {
					if (allocation[index] > 0) result.set(line.variantId, allocation[index])
				})
				return result
			}
			case PromotionBenefitType.BUY_X_PAY_Y: {
				if (scope !== PromotionTargetScope.ELIGIBLE_ITEMS) return result
				// One shared pool when the shopper may mix participating items,
				// otherwise one pool per product so packs must be whole units of
				// the same product.
				const pools: PricingEngineLine[][] = mixAndMatch
					? [targetLines]
					: [...groupByProductId(targetLines).values()]
				for (const pool of pools) {
					const units: { variantId: string; priceCents: number }[] = []
					for (const line of pool) {
						for (let index = 0; index < line.quantity; index += 1) {
							units.push({ variantId: line.variantId, priceCents: line.unitPriceCents })
						}
					}
					const groups = Math.floor(units.length / benefit.buyQuantity)
					const freeUnits = groups * (benefit.buyQuantity - benefit.payQuantity)
					if (freeUnits <= 0) continue
					units.sort((a, b) => a.priceCents - b.priceCents)
					for (let index = 0; index < freeUnits; index += 1) {
						const unit = units[index]
						result.set(unit.variantId, (result.get(unit.variantId) ?? 0) + unit.priceCents)
					}
				}
				// Cap each line at its remaining net value.
				for (const line of targetLines) {
					const capped = Math.min(result.get(line.variantId) ?? 0, Math.max(0, netOf(line)))
					if (capped > 0) result.set(line.variantId, capped)
					else result.delete(line.variantId)
				}
				return result
			}
			default:
				return result
		}
	}

	private static resolveCoupon(
		requestedCoupon: string | null,
		activePromotions: EnginePromotion[],
		applied: EngineAppliedPromotion[],
	): EngineCoupon {
		if (!requestedCoupon) {
			return { code: null, accepted: false, rejection: null }
		}
		const couponPromotions = activePromotions.filter((entry) => entry.promotion.isCouponOnly())
		const matching = couponPromotions.filter(
			(entry) => entry.promotion.couponCode() === requestedCoupon,
		)
		if (matching.length === 0) {
			return {
				code: requestedCoupon,
				accepted: false,
				rejection: { code: requestedCoupon, message: COUPON_INVALID_MESSAGE },
			}
		}
		const appliedIds = new Set(applied.map((entry) => entry.id))
		const didApply = matching.some((entry) => appliedIds.has(entry.promotion.id.toString()))
		if (didApply) {
			return { code: requestedCoupon, accepted: true, rejection: null }
		}
		return {
			code: requestedCoupon,
			accepted: false,
			rejection: { code: requestedCoupon, message: COUPON_NOT_APPLICABLE_MESSAGE },
		}
	}
}
