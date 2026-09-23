/**
 * Port for turning a Brazilian CEP into geographic coordinates. The concrete
 * adapter (AwesomeAPI → ViaCEP → Nominatim) lives in `src/infra/geocoding`; the
 * rest of the shipping feature depends only on this abstraction so a future
 * switch to a routing API or a self-hosted instance stays local.
 *
 * Three outcomes are distinguished on purpose:
 *  - `found`       — coordinates resolved. `provider` names the source that
 *                    produced them (`awesomeapi`, `nominatim`, ...), recorded on
 *                    the geocode cache row so a coordinate's origin is known.
 *  - `not-found`   — well-formed CEP, but no result anywhere (a user error).
 *  - `unavailable` — the geocoder could not answer right now (network error,
 *                    timeout, HTTP 5xx, rate limit). A transient condition,
 *                    never "the CEP is wrong".
 */
export type GeocodeResult =
	| { status: 'found'; latitude: number; longitude: number; provider: string }
	| { status: 'not-found' }
	| { status: 'unavailable' }

export abstract class CepGeocoder {
	abstract resolvePostalCode(postalCode: string): Promise<GeocodeResult>
}
