import { UseCaseError } from '@/core/errors/use-case-error'

export class IdempotencyKeyReusedError extends Error implements UseCaseError {
	constructor() {
		super('Idempotency Key was already used with a different request')
	}
}
