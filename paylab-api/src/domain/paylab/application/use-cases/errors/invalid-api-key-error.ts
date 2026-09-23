import { UseCaseError } from '@/core/errors/use-case-error'

export class InvalidApiKeyError extends Error implements UseCaseError {
	constructor() {
		super('Invalid API key')
	}
}
