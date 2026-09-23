import { StoreShippingSettings } from '../entities/store-shipping-settings'

export interface CalculateDeliveryFeeInput {
	distanceKm: number
	settings: StoreShippingSettings
}

export interface DeliveryFeeResult {
	feeCents: number
	available: boolean
	freeShippingApplied: boolean
}

/**
 * Pure fee math for local delivery (ADR 0007):
 *   feeCents = baseCents + ceil(distanceKm) * perKmCents
 * The whole fee (base included) is waived when the delivery is within a non-zero
 * `freeShippingDistanceKm` radius, and the option is marked unavailable beyond
 * `maxDistanceKm`. Takes an already-resolved distance — no repo, no geocoder.
 */
export function calculateDeliveryFee({
	distanceKm,
	settings,
}: CalculateDeliveryFeeInput): DeliveryFeeResult {
	if (distanceKm > settings.maxDistanceKm) {
		return { feeCents: 0, available: false, freeShippingApplied: false }
	}

	const freeShippingApplied =
		settings.freeShippingDistanceKm > 0 && distanceKm <= settings.freeShippingDistanceKm

	const feeCents = freeShippingApplied
		? 0
		: settings.baseCents + Math.ceil(distanceKm) * settings.perKmCents

	return { feeCents, available: true, freeShippingApplied }
}
