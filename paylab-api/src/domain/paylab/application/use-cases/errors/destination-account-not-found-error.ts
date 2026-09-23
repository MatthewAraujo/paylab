import { UseCaseError } from '@/core/errors/use-case-error'

export class DestinationAccountNotFoundError extends Error implements UseCaseError {
	constructor() {
		super('Destination Account not found')
	}
}
