import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { calculateDeliveryFee } from '@/domain/quintalpet/enterprise/services/calculate-delivery-fee'
import { describe, expect, test } from 'vitest'

function settings(overrides: Partial<Record<string, number>> = {}) {
	return StoreShippingSettings.create({
		storeId: new UniqueEntityID('store-1'),
		originPostalCode: '02010000',
		baseCents: overrides.baseCents ?? 500,
		perKmCents: overrides.perKmCents ?? 120,
		maxDistanceKm: overrides.maxDistanceKm ?? 15,
		freeShippingDistanceKm: overrides.freeShippingDistanceKm ?? 0,
	})
}

describe('calculateDeliveryFee', () => {
	test('fee is base + ceil(distanceKm) * perKm', () => {
		// base 500, perKm 120
		expect(calculateDeliveryFee({ distanceKm: 0.1, settings: settings() }).feeCents).toBe(620)
		expect(calculateDeliveryFee({ distanceKm: 3.0, settings: settings() }).feeCents).toBe(860)
		expect(calculateDeliveryFee({ distanceKm: 3.01, settings: settings() }).feeCents).toBe(980)
	})

	test('beyond maxDistanceKm the option is unavailable', () => {
		const result = calculateDeliveryFee({
			distanceKm: 15.001,
			settings: settings({ maxDistanceKm: 15 }),
		})
		expect(result.available).toBe(false)
	})

	test('at exactly maxDistanceKm the option is still available', () => {
		expect(
			calculateDeliveryFee({
				distanceKm: 15,
				settings: settings({ maxDistanceKm: 15 }),
			}).available,
		).toBe(true)
	})

	test('a delivery within a non-zero free-shipping radius is free', () => {
		const result = calculateDeliveryFee({
			distanceKm: 3,
			settings: settings({ freeShippingDistanceKm: 5 }),
		})
		expect(result.feeCents).toBe(0)
		expect(result.freeShippingApplied).toBe(true)
		expect(result.available).toBe(true)
	})

	test('at exactly the free-shipping radius the delivery is still free', () => {
		const result = calculateDeliveryFee({
			distanceKm: 5,
			settings: settings({ freeShippingDistanceKm: 5 }),
		})
		expect(result.feeCents).toBe(0)
		expect(result.freeShippingApplied).toBe(true)
	})

	test('just beyond the free-shipping radius the full fee applies', () => {
		const result = calculateDeliveryFee({
			distanceKm: 5.01,
			settings: settings({ freeShippingDistanceKm: 5 }),
		})
		expect(result.feeCents).toBe(500 + 6 * 120)
		expect(result.freeShippingApplied).toBe(false)
	})

	test('a free-shipping radius of 0 disables free shipping regardless of distance', () => {
		const result = calculateDeliveryFee({
			distanceKm: 0.5,
			settings: settings({ freeShippingDistanceKm: 0 }),
		})
		expect(result.feeCents).toBe(500 + 1 * 120)
		expect(result.freeShippingApplied).toBe(false)
	})
})
