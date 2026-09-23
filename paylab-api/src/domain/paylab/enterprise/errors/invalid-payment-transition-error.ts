import { UseCaseError } from '@/core/errors/use-case-error'

export class InvalidPaymentTransitionError extends Error implements UseCaseError {
	constructor(from: string, to: string) {
		super(`Invalid Payment transition: ${from} -> ${to}`)
	}
}
