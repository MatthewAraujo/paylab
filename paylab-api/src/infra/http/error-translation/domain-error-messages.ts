import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'

export interface TranslatedDomainError {
	code: string
	message: string
}

type ErrorTranslator = (error: Error) => TranslatedDomainError

/**
 * Central domain-error -> HTTP-body translation table.
 *
 * Keep this a flat Map, not a chain of `if (error instanceof X)`, so adding the next
 * mapped error is a one-line addition.
 */
const domainErrorTranslators = new Map<Function, ErrorTranslator>([
	[
		NotAllowedError,
		() => ({
			code: 'NOT_ALLOWED',
			message: 'You are not allowed to perform this action.',
		}),
	],
	[
		ResourceNotFoundError,
		() => ({
			code: 'RESOURCE_NOT_FOUND',
			message: 'The requested resource was not found.',
		}),
	],
])

/**
 * Looks up a `{ code, message }` translation for a known domain error. Returns
 * null for anything not mapped so callers fall back to their existing behavior
 * (the raw `error.message`).
 */
export function translateDomainError(error: unknown): TranslatedDomainError | null {
	if (!(error instanceof Error)) {
		return null
	}

	const translator = domainErrorTranslators.get(error.constructor as Function)

	return translator ? translator(error) : null
}
