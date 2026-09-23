import { InvalidPromotionPayloadError } from '../errors/invalid-promotion-payload-error'
import { PromotionChannel } from '../types/promotion-channel'

/**
 * Typed contract for the `Promotion.conditions` JSON payload. The database
 * stores an untyped `Json` array (T1); this module owns the typed validation at
 * the domain boundary (T2). A condition is a trigger that must hold for the
 * promotion to apply — it is not the same as the benefit target scope.
 */
export enum PromotionConditionType {
	PRODUCT = 'PRODUCT',
	CATEGORY = 'CATEGORY',
	MIN_ELIGIBLE_QUANTITY = 'MIN_ELIGIBLE_QUANTITY',
	MIN_CART_VALUE = 'MIN_CART_VALUE',
	COUPON = 'COUPON',
	CHANNEL = 'CHANNEL',
	DELIVERY_METHOD = 'DELIVERY_METHOD',
}

export interface ProductCondition {
	type: PromotionConditionType.PRODUCT
	productId: string
}

export interface CategoryCondition {
	type: PromotionConditionType.CATEGORY
	categoryId: string
	/** A category condition always covers the full subtree unless explicitly disabled. */
	includeDescendants: boolean
}

export interface MinEligibleQuantityCondition {
	type: PromotionConditionType.MIN_ELIGIBLE_QUANTITY
	quantity: number
}

export interface MinCartValueCondition {
	type: PromotionConditionType.MIN_CART_VALUE
	/** Evaluated against the GROSS pre-discount eligibility subtotal. */
	amountCents: number
}

export interface CouponCondition {
	type: PromotionConditionType.COUPON
	/** Normalized to upper-case, trimmed. */
	code: string
}

export interface ChannelCondition {
	type: PromotionConditionType.CHANNEL
	channel: PromotionChannel
}

export interface DeliveryMethodCondition {
	type: PromotionConditionType.DELIVERY_METHOD
	method: string
}

export type PromotionCondition =
	| ProductCondition
	| CategoryCondition
	| MinEligibleQuantityCondition
	| MinCartValueCondition
	| CouponCondition
	| ChannelCondition
	| DeliveryMethodCondition

function asRecord(entry: unknown, index: number): Record<string, unknown> {
	if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
		throw new InvalidPromotionPayloadError(`condition #${index} must be an object`)
	}
	return entry as Record<string, unknown>
}

function requireString(record: Record<string, unknown>, key: string, index: number): string {
	const value = record[key]
	if (typeof value !== 'string' || value.trim().length === 0) {
		throw new InvalidPromotionPayloadError(`condition #${index} requires a non-empty "${key}"`)
	}
	return value
}

function requirePositiveInt(record: Record<string, unknown>, key: string, index: number): number {
	const value = record[key]
	if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
		throw new InvalidPromotionPayloadError(
			`condition #${index} requires a positive integer "${key}"`,
		)
	}
	return value
}

function parseCondition(entry: unknown, index: number): PromotionCondition {
	const record = asRecord(entry, index)
	const type = record.type

	switch (type) {
		case PromotionConditionType.PRODUCT:
			return { type, productId: requireString(record, 'productId', index) }
		case PromotionConditionType.CATEGORY:
			return {
				type,
				categoryId: requireString(record, 'categoryId', index),
				includeDescendants: record.includeDescendants !== false,
			}
		case PromotionConditionType.MIN_ELIGIBLE_QUANTITY:
			return { type, quantity: requirePositiveInt(record, 'quantity', index) }
		case PromotionConditionType.MIN_CART_VALUE:
			return { type, amountCents: requirePositiveInt(record, 'amountCents', index) }
		case PromotionConditionType.COUPON:
			return { type, code: requireString(record, 'code', index).trim().toUpperCase() }
		case PromotionConditionType.CHANNEL: {
			const channel = requireString(record, 'channel', index)
			if (!Object.values(PromotionChannel).includes(channel as PromotionChannel)) {
				throw new InvalidPromotionPayloadError(`condition #${index} has an unknown channel`)
			}
			return { type, channel: channel as PromotionChannel }
		}
		case PromotionConditionType.DELIVERY_METHOD:
			return { type, method: requireString(record, 'method', index) }
		default:
			throw new InvalidPromotionPayloadError(
				`condition #${index} has an unknown type "${String(type)}"`,
			)
	}
}

export function parsePromotionConditions(raw: unknown): PromotionCondition[] {
	if (raw === undefined || raw === null) {
		return []
	}
	if (!Array.isArray(raw)) {
		throw new InvalidPromotionPayloadError('conditions must be an array')
	}
	return raw.map(parseCondition)
}
