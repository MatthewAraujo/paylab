import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { translateDomainError } from '@/infra/http/error-translation/domain-error-messages'

describe('translateDomainError', () => {
	test('translates ResourceNotFoundError', () => {
		expect(translateDomainError(new ResourceNotFoundError())).toEqual({
			code: 'RESOURCE_NOT_FOUND',
			message: 'The requested resource was not found.',
		})
	})

	test('translates NotAllowedError', () => {
		expect(translateDomainError(new NotAllowedError())).toEqual({
			code: 'NOT_ALLOWED',
			message: 'You are not allowed to perform this action.',
		})
	})

	test('returns null for unmapped errors and non-errors', () => {
		expect(translateDomainError(new Error('boom'))).toBeNull()
		expect(translateDomainError('boom')).toBeNull()
	})
})
