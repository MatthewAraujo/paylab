import { UseCaseError } from '@/core/errors/use-case-error'

export class UnsupportedCurrencyError extends Error implements UseCaseError {
	constructor(currency: string) {
		super(`Unsupported currency: ${currency}`)
	}
}
