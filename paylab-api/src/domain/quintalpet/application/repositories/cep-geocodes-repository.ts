export interface CepCoordinates {
	latitude: number
	longitude: number
}

/**
 * Persistent cache of CEP -> coordinates. A CEP coordinate is global and stable,
 * so entries have no TTL in v1 (ADR 0007). Each row also records the `provider`
 * that resolved it (ADR 0012); `provider` is write-time only and is not part of
 * {@link CepCoordinates}.
 */
export abstract class CepGeocodesRepository {
	abstract findByPostalCode(postalCode: string): Promise<CepCoordinates | null>
	abstract save(postalCode: string, coordinates: CepCoordinates, provider: string): Promise<void>
}
