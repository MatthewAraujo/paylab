const SENSITIVE_NAME = '(?:password|passwd|secret|token|api[_-]?key|credential|private[_-]?key)'

const DATABASE_URL = /\bpostgres(?:ql)?:\/\/\S+/gi
const URL_WITH_CREDENTIALS = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/@:]+:[^\s/@]+@[^\s/]+/gi
const BEARER_TOKEN = /\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi
const JSON_ASSIGNMENT = new RegExp(`("[^"]*${SENSITIVE_NAME}[^"]*"\\s*:\\s*")[^"]*(")`, 'gi')
const ENV_ASSIGNMENT = new RegExp(`(\\b\\w*${SENSITIVE_NAME}\\w*\\s*[=:]\\s*)[^\\s,;"']+`, 'gi')

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Removes what must never reach a stored or served log: database URLs, credentials in URLs,
 * bearer tokens, values assigned to sensitive names, and the configured secret values.
 * It works on one line at a time, so a secret can never straddle a chunk boundary.
 */
export function createSanitizer(options: { secrets?: string[] } = {}) {
	const literals = (options.secrets ?? [])
		.map((secret) => secret.trim())
		.filter((secret) => secret.length > 0)
		.sort((a, b) => b.length - a.length)
		.map((secret) => new RegExp(escapeRegExp(secret), 'g'))

	return function sanitize(text: string): string {
		let result = text
			.replace(DATABASE_URL, '[REDACTED_DATABASE_URL]')
			.replace(URL_WITH_CREDENTIALS, '[REDACTED_URL]')
			.replace(BEARER_TOKEN, 'Bearer [REDACTED]')
		for (const literal of literals) {
			result = result.replace(literal, '[REDACTED]')
		}
		return result.replace(JSON_ASSIGNMENT, '$1[REDACTED]$2').replace(ENV_ASSIGNMENT, '$1[REDACTED]')
	}
}
