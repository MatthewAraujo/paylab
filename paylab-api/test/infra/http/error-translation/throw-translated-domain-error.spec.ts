import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { ForbiddenException, NotFoundException } from '@nestjs/common'

describe('throwTranslatedDomainError', () => {
	test('maps ResourceNotFoundError to 404 with a translated body', () => {
		try {
			throwTranslatedDomainError(new ResourceNotFoundError())
			expect.unreachable()
		} catch (error) {
			expect(error).toBeInstanceOf(NotFoundException)
			expect((error as NotFoundException).getResponse()).toMatchObject({
				code: 'RESOURCE_NOT_FOUND',
			})
		}
	})

	test('maps NotAllowedError to 403 with a translated body', () => {
		try {
			throwTranslatedDomainError(new NotAllowedError())
			expect.unreachable()
		} catch (error) {
			expect(error).toBeInstanceOf(ForbiddenException)
			expect((error as ForbiddenException).getResponse()).toMatchObject({ code: 'NOT_ALLOWED' })
		}
	})

	test('rethrows errors that are not in the status map unchanged', () => {
		const error = new Error('boom')

		expect(() => throwTranslatedDomainError(error)).toThrow(error)
	})

	test('rethrows non-Error values unchanged', () => {
		expect(() => throwTranslatedDomainError('boom')).toThrow('boom')
	})
})
