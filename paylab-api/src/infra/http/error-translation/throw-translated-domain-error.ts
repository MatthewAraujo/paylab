import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import {
	BadRequestException,
	ConflictException,
	ForbiddenException,
	NotFoundException,
} from '@nestjs/common'
import { translateDomainError } from './domain-error-messages'

/**
 * Central domain-error -> HTTP-status map. Later tasks register their own
 * error classes here; a status change for a class already listed is a
 * regression, not a refactor.
 */
export const domainErrorStatusCodes = new Map<Function, number>([
	[NotAllowedError, 403],
	[ResourceNotFoundError, 404],
])

/**
 * Looks up a caught error's HTTP status in `domainErrorStatusCodes` and
 * throws the matching NestJS `HttpException` subclass with a body of
 * `{ code, message }` from `translateDomainError`, falling back to
 * `{ message: error.message }` when there's no translation entry.
 *
 * If the error's class isn't in the status map at all, it is rethrown
 * unchanged — callers further up (or NestJS's default exception filter)
 * decide what to do with it.
 */
export function throwTranslatedDomainError(error: unknown): never {
	const status = error instanceof Error ? domainErrorStatusCodes.get(error.constructor) : undefined

	if (status === undefined) {
		throw error
	}

	const body = translateDomainError(error) ?? { message: (error as Error).message }

	switch (status) {
		case 400:
			throw new BadRequestException(body)
		case 403:
			throw new ForbiddenException(body)
		case 404:
			throw new NotFoundException(body)
		case 409:
			throw new ConflictException(body)
		default:
			throw error
	}
}
