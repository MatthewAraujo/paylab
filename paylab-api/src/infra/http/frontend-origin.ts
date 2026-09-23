const DEFAULT_FRONTEND_ORIGIN = 'http://localhost:3000'

function stripTrailingSlash(value: string): string {
	return value.replace(/\/+$/, '')
}

/**
 * The primary frontend origin. Used wherever a single canonical origin is
 * required (Better Auth `trustedOrigins`, email link building). Falls back to
 * localhost only outside production — {@link getAllowedOrigins} is the one that
 * fails closed for CORS.
 */
export function getFrontendOrigin(): string {
	const configuredOrigin = getConfiguredOrigins()[0]
	if (!configuredOrigin) {
		return DEFAULT_FRONTEND_ORIGIN
	}

	return configuredOrigin
}

/**
 * Every browser origin allowed to make credentialed cross-origin calls to this
 * API. Reads `FRONTEND_URL` (and the optional `CORS_ALLOWED_ORIGINS`), both of
 * which accept a comma-separated list so apex + `www` (or a staging origin) can
 * be permitted at once. In production an empty result is a configuration error
 * and the caller must fail closed rather than fall back to localhost.
 */
export function getAllowedOrigins(): string[] {
	const origins = getConfiguredOrigins()

	if (origins.length === 0 && process.env.NODE_ENV !== 'production') {
		return [DEFAULT_FRONTEND_ORIGIN]
	}

	return origins
}

function getConfiguredOrigins(): string[] {
	return [process.env.FRONTEND_URL, process.env.CORS_ALLOWED_ORIGINS]
		.filter((value): value is string => Boolean(value?.trim()))
		.flatMap((value) => value.split(','))
		.map((value) => stripTrailingSlash(value.trim()))
		.filter((value, index, all) => value.length > 0 && all.indexOf(value) === index)
}
