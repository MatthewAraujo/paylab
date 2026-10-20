/** The body of every FakeBank error response (AC-10). */
export interface ErrorEnvelope {
	code: string
	message: string
	retryable: boolean
	requestId: string
}

// The only place `retryable` is decided: a Client may retry exactly these statuses.
const RETRYABLE_STATUSES = new Set([429, 500, 503])

export function isRetryable(status: number): boolean {
	return RETRYABLE_STATUSES.has(status)
}

// Fallback codes for errors raised without an explicit `code` (framework errors such as
// an unknown route). Handlers that know the business reason pass their own code.
const DEFAULT_CODES = new Map<number, string>([
	[400, 'VALIDATION_ERROR'],
	[401, 'UNAUTHORIZED'],
	[404, 'NOT_FOUND'],
	[405, 'METHOD_NOT_ALLOWED'],
	[409, 'CONFLICT'],
	[413, 'PAYLOAD_TOO_LARGE'],
	[422, 'UNPROCESSABLE_ENTITY'],
	[429, 'PROVIDER_RATE_LIMIT'],
	[500, 'PROVIDER_INTERNAL_ERROR'],
	[503, 'PROVIDER_UNAVAILABLE'],
])

export function defaultCodeFor(status: number): string {
	return DEFAULT_CODES.get(status) ?? (status >= 500 ? 'PROVIDER_INTERNAL_ERROR' : 'HTTP_ERROR')
}
