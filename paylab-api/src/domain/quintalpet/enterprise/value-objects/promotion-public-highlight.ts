import { InvalidPromotionPayloadError } from '../errors/invalid-promotion-payload-error'

/**
 * Typed contract for the optional `Promotion.publicHighlight` JSON payload —
 * the storefront-safe description of a promotion shown before cart pricing.
 * It never carries coupon codes or a promised final total.
 */
export interface PromotionProjectedPack {
	quantity: number
	priceCents: number
}

export interface PromotionPublicHighlight {
	badge?: string
	projectedPack?: PromotionProjectedPack
}

export function parsePromotionPublicHighlight(raw: unknown): PromotionPublicHighlight | null {
	if (raw === undefined || raw === null) {
		return null
	}
	if (typeof raw !== 'object' || Array.isArray(raw)) {
		throw new InvalidPromotionPayloadError('publicHighlight must be an object')
	}

	const record = raw as Record<string, unknown>
	const highlight: PromotionPublicHighlight = {}

	if (record.badge !== undefined && record.badge !== null) {
		if (typeof record.badge !== 'string' || record.badge.trim().length === 0) {
			throw new InvalidPromotionPayloadError('publicHighlight.badge must be a non-empty string')
		}
		highlight.badge = record.badge
	}

	if (record.projectedPack !== undefined && record.projectedPack !== null) {
		const pack = record.projectedPack
		if (typeof pack !== 'object' || Array.isArray(pack)) {
			throw new InvalidPromotionPayloadError('publicHighlight.projectedPack must be an object')
		}
		const packRecord = pack as Record<string, unknown>
		const quantity = packRecord.quantity
		const priceCents = packRecord.priceCents
		if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity <= 0) {
			throw new InvalidPromotionPayloadError(
				'publicHighlight.projectedPack.quantity must be a positive integer',
			)
		}
		if (typeof priceCents !== 'number' || !Number.isInteger(priceCents) || priceCents < 0) {
			throw new InvalidPromotionPayloadError(
				'publicHighlight.projectedPack.priceCents must be a non-negative integer',
			)
		}
		highlight.projectedPack = { quantity, priceCents }
	}

	return highlight
}
