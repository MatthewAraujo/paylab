// Server-owned metadata for the customer self-service delivery options.
//
// `pickup-store` is a static, free, geocoding-free option. `local-shipping`
// keeps a fixed label and ETA here; its fee is computed from distance by
// `calculateDeliveryFee` (ADR 0007) at quote/placement time — never read from a
// client, never a flat table value. ETA does not vary with distance.
export const DELIVERY_OPTIONS = {
	'pickup-store': { label: 'Retirada na loja', etaDays: [0, 1] as const },
	'local-shipping': { label: 'Entrega local', etaDays: [1, 2] as const },
} as const

export type DeliveryOptionId = keyof typeof DELIVERY_OPTIONS

export function isDeliveryOptionId(deliveryOptionId: string): deliveryOptionId is DeliveryOptionId {
	return Object.prototype.hasOwnProperty.call(DELIVERY_OPTIONS, deliveryOptionId)
}

export interface ResolvedDeliveryOption {
	label: string
	etaDays: readonly [number, number]
}

export function resolveDeliveryOption(deliveryOptionId: string): ResolvedDeliveryOption | null {
	return isDeliveryOptionId(deliveryOptionId) ? DELIVERY_OPTIONS[deliveryOptionId] : null
}
