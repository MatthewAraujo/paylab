import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { DestinationAccountNotFoundError } from '@/domain/paylab/application/use-cases/errors/destination-account-not-found-error'
import { IdempotencyKeyReusedError } from '@/domain/paylab/application/use-cases/errors/idempotency-key-reused-error'
import { InvalidAmountError } from '@/domain/paylab/enterprise/errors/invalid-amount-error'
import { InvalidPaymentError } from '@/domain/paylab/enterprise/errors/invalid-payment-error'
import { UnsupportedCurrencyError } from '@/domain/paylab/enterprise/errors/unsupported-currency-error'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common'

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

describe('throwTranslatedDomainError (Payment errors)', () => {
	const cases: [string, Error, string][] = [
		['InvalidAmountError', new InvalidAmountError(), 'INVALID_AMOUNT'],
		['InvalidPaymentError', new InvalidPaymentError('same account'), 'INVALID_PAYMENT'],
		['UnsupportedCurrencyError', new UnsupportedCurrencyError('USD'), 'UNSUPPORTED_CURRENCY'],
		[
			'DestinationAccountNotFoundError',
			new DestinationAccountNotFoundError(),
			'DESTINATION_ACCOUNT_NOT_FOUND',
		],
		['IdempotencyKeyReusedError', new IdempotencyKeyReusedError(), 'IDEMPOTENCY_KEY_REUSED'],
	]

	test.each(cases)('maps %s to 422 with its own code', (_name, error, code) => {
		try {
			throwTranslatedDomainError(error)
		} catch (thrown) {
			expect(thrown).toBeInstanceOf(UnprocessableEntityException)
			expect((thrown as UnprocessableEntityException).getResponse()).toMatchObject({ code })
			return
		}
		throw new Error('expected a throw')
	})
})
