import {
	ROAD_CORRECTION_FACTOR,
	haversineKm,
} from '@/domain/quintalpet/enterprise/services/haversine-distance'
import { describe, expect, test } from 'vitest'

describe('haversineKm', () => {
	test('one degree of arc on a mean-radius sphere is ~111.19 km (independently known: π·6371/180)', () => {
		const distance = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })
		expect(distance).toBeGreaterThan(111.0)
		expect(distance).toBeLessThan(111.4)
	})

	test('one degree of longitude at the equator is also ~111.19 km', () => {
		const distance = haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 })
		expect(distance).toBeGreaterThan(111.0)
		expect(distance).toBeLessThan(111.4)
	})

	test('identical points are zero distance', () => {
		expect(
			haversineKm({ latitude: -23.55, longitude: -46.63 }, { latitude: -23.55, longitude: -46.63 }),
		).toBe(0)
	})

	test('Av. Paulista to the São Paulo Cathedral is ~2.6 km straight-line', () => {
		// Two well-known São Paulo landmarks; the ~2.5–2.8 km straight-line gap
		// is verifiable on any map, not computed the way haversineKm computes it.
		const paulista = { latitude: -23.5614, longitude: -46.6559 }
		const cathedral = { latitude: -23.5505, longitude: -46.6333 }

		const distance = haversineKm(paulista, cathedral)
		expect(distance).toBeGreaterThan(2.3)
		expect(distance).toBeLessThan(2.9)
	})
})

describe('ROAD_CORRECTION_FACTOR', () => {
	test('is 1.3 (Haversine underestimates real street distance)', () => {
		expect(ROAD_CORRECTION_FACTOR).toBe(1.3)
	})
})
