export interface GeoPoint {
	latitude: number
	longitude: number
}

const EARTH_RADIUS_KM = 6371

/**
 * Straight-line (great-circle) distance between two coordinates, in kilometres.
 */
export function haversineKm(a: GeoPoint, b: GeoPoint): number {
	const dLat = toRadians(b.latitude - a.latitude)
	const dLon = toRadians(b.longitude - a.longitude)

	const lat1 = toRadians(a.latitude)
	const lat2 = toRadians(b.latitude)

	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2

	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)))
}

/**
 * Multiplier applied to the Haversine distance to approximate real street
 * distance. Straight-line consistently underestimates how far a delivery
 * actually drives; 1.3 is the widely used detour-index approximation for urban
 * road networks (ADR 0007 — Haversine + a flat correction factor, no routing API).
 */
export const ROAD_CORRECTION_FACTOR = 1.3

function toRadians(degrees: number): number {
	return (degrees * Math.PI) / 180
}
