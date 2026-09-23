import { InvalidPromotionPayloadError } from '../errors/invalid-promotion-payload-error'

/**
 * Typed contract for the `Promotion.benefits` JSON payload. The database stores
 * an untyped `Json` array (T1); this module owns the typed validation at the
 * domain boundary (T2).
 */
export enum PromotionBenefitType {
	PERCENTAGE = 'PERCENTAGE',
	FIXED_AMOUNT = 'FIXED_AMOUNT',
	BUY_X_PAY_Y = 'BUY_X_PAY_Y',
	FREE_SHIPPING = 'FREE_SHIPPING',
}

export interface PercentageBenefit {
	type: PromotionBenefitType.PERCENTAGE
	/** 0 < percentage <= 100 */
	percentage: number
}

export interface FixedAmountBenefit {
	type: PromotionBenefitType.FIXED_AMOUNT
	amountCents: number
}

export interface BuyXPayYBenefit {
	type: PromotionBenefitType.BUY_X_PAY_Y
	buyQuantity: number
	payQuantity: number
}

export interface FreeShippingBenefit {
	type: PromotionBenefitType.FREE_SHIPPING
}

export type PromotionBenefit =
	| PercentageBenefit
	| FixedAmountBenefit
	| BuyXPayYBenefit
	| FreeShippingBenefit

function asRecord(entry: unknown, index: number): Record<string, unknown> {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		throw new InvalidPromotionPayloadError(`benefit #${index} must be an object`)
	}
	return entry as Record<string, unknown>
}

function requirePositiveInt(record: Record<string, unknown>, key: string, index: number): number {
	const value = record[key]
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new InvalidPromotionPayloadError(`benefit #${index} requires a positive integer "${key}"`)
	}
	return value
}

function parseBenefit(entry: unknown, index: number): PromotionBenefit {
	const record = asRecord(entry, index)
	const type = record.type

	switch (type) {
		case PromotionBenefitType.PERCENTAGE: {
			const percentage = record.percentage
			if (typeof percentage !== 'number' || percentage <= 0 || percentage > 100) {
				throw new InvalidPromotionPayloadError(
					`benefit #${index} percentage must be within (0, 100]`,
				)
			}
			return { type, percentage }
		}
		case PromotionBenefitType.FIXED_AMOUNT:
			return { type, amountCents: requirePositiveInt(record, 'amountCents', index) }
		case PromotionBenefitType.BUY_X_PAY_Y: {
			const buyQuantity = requirePositiveInt(record, 'buyQuantity', index)
			const payQuantity = requirePositiveInt(record, 'payQuantity', index)
			if (payQuantity >= buyQuantity) {
				throw new InvalidPromotionPayloadError(
					`benefit #${index} requires payQuantity < buyQuantity`,
				)
			}
			return { type, buyQuantity, payQuantity }
		}
		case PromotionBenefitType.FREE_SHIPPING:
			return { type }
		default:
			throw new InvalidPromotionPayloadError(
				`benefit #${index} has an unknown type "${String(type)}"`,
			)
	}
}

export function parsePromotionBenefits(raw: unknown): PromotionBenefit[] {
	if (raw === undefined || raw === null) {
		return []
	}
	if (!Array.isArray(raw)) {
		throw new InvalidPromotionPayloadError('benefits must be an array')
	}
	return raw.map(parseBenefit)
}
