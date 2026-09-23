/**
 * A well-formed CEP that could not be geocoded *right now* — Nominatim was
 * down, timed out, or rate-limited. Transient: the caller should surface a
 * "try again" message, never "your CEP is wrong". Not routed through the
 * domain-error translation map (it is a 503, not a 4xx).
 */
export class GeocoderUnavailableError extends Error {
	constructor() {
		super('The geocoding service is temporarily unavailable.')
	}
}
