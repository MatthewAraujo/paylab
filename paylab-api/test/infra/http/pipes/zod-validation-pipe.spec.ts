import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { UnprocessableEntityException } from '@nestjs/common'
import { z } from 'zod'
import { fromZodError } from 'zod-validation-error'

const VALIDATION_MESSAGE = 'Invalid request. Check the fields and try again.'

function captureThrow(fn: () => unknown): UnprocessableEntityException {
	try {
		fn()
	} catch (error) {
		if (error instanceof UnprocessableEntityException) {
			return error
		}
		throw error
	}
	throw new Error('Expected pipe.transform to throw')
}

describe('ZodValidationPipe', () => {
	test('ZodError branch: throws UnprocessableEntityException with code, message and unchanged errors field', () => {
		const schema = z.object({ name: z.string() })
		const pipe = new ZodValidationPipe(schema)
		const invalidValue = { name: 123 }

		const thrown = captureThrow(() => pipe.transform(invalidValue))

		let zodError: z.ZodError
		try {
			schema.parse(invalidValue)
			throw new Error('expected schema.parse to throw')
		} catch (error) {
			zodError = error as z.ZodError
		}
		const expectedErrors = fromZodError(zodError)

		expect(thrown.getStatus()).toBe(422)
		const response = thrown.getResponse() as Record<string, unknown>
		expect(response.statusCode).toBe(422)
		expect(response.code).toBe('VALIDATION_ERROR')
		expect(response.message).toBe(VALIDATION_MESSAGE)
		expect(response.errors).toBeInstanceOf(expectedErrors.constructor)
		expect((response.errors as Error).message).toBe(expectedErrors.message)
	})

	test('non-ZodError branch: still throws UnprocessableEntityException with the same code and message', () => {
		const schema = z.object({ name: z.string() }).transform(() => {
			throw new Error('boom - not a zod error')
		})
		const pipe = new ZodValidationPipe(schema)

		const thrown = captureThrow(() => pipe.transform({ name: 'ok' }))

		expect(thrown.getStatus()).toBe(422)
		expect(thrown.getResponse()).toEqual({
			code: 'VALIDATION_ERROR',
			message: VALIDATION_MESSAGE,
		})
	})
})
