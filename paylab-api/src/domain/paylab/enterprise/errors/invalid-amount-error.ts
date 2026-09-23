import { UseCaseError } from '@/core/errors/use-case-error'

export class InvalidAmountError extends Error implements UseCaseError {
	constructor(reason = 'Amount must be a positive integer number of centavos') {
		super(reason)
	}
}
