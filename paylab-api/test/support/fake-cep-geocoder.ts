import { CepGeocoder, GeocodeResult } from '@/domain/quintalpet/application/gateways/cep-geocoder'

const DEFAULT_PROVIDER = 'fake'

function defaultFound(): GeocodeResult {
	return { status: 'found', latitude: -23.5015, longitude: -46.6255, provider: DEFAULT_PROVIDER }
}

/**
 * In-memory {@link CepGeocoder} for tests. No real network. By default every
 * well-formed CEP resolves to a fixed São Paulo coordinate (provider `fake`);
 * individual CEPs can be pinned to specific coordinates or to the `not-found` /
 * `unavailable` outcomes.
 */
export class FakeCepGeocoder implements CepGeocoder {
	public calls: string[] = []

	private readonly entries = new Map<string, GeocodeResult>()
	private defaultResult: GeocodeResult = defaultFound()

	setCoordinates(
		postalCode: string,
		latitude: number,
		longitude: number,
		provider: string = DEFAULT_PROVIDER,
	): void {
		this.entries.set(normalize(postalCode), { status: 'found', latitude, longitude, provider })
	}

	setNotFound(postalCode: string): void {
		this.entries.set(normalize(postalCode), { status: 'not-found' })
	}

	setUnavailable(postalCode: string): void {
		this.entries.set(normalize(postalCode), { status: 'unavailable' })
	}

	setDefault(result: GeocodeResult): void {
		this.defaultResult = result
	}

	reset(): void {
		this.calls = []
		this.entries.clear()
		this.defaultResult = defaultFound()
	}

	async resolvePostalCode(postalCode: string): Promise<GeocodeResult> {
		const key = normalize(postalCode)
		this.calls.push(key)
		return this.entries.get(key) ?? this.defaultResult
	}
}

function normalize(postalCode: string): string {
	return postalCode.replace(/\D/g, '')
}
