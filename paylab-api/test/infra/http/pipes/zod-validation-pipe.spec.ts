import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'
import { fromZodError } from 'zod-validation-error'

const VALIDATION_MESSAGE = 'Dados inválidos. Verifique os campos e tente novamente.'

function captureThrow(fn: () => unknown): BadRequestException {
	try {
		fn()
	} catch (error) {
		if (error instanceof BadRequestException) {
			return error
		}
		throw error
	}
	throw new Error('Expected pipe.transform to throw')
}

describe('ZodValidationPipe', () => {
	test('ZodError branch: throws BadRequestException with code, PT-BR message and unchanged errors field', () => {
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

		expect(thrown.getStatus()).toBe(400)
		const response = thrown.getResponse() as Record<string, unknown>
		expect(response.statusCode).toBe(400)
		expect(response.code).toBe('VALIDATION_ERROR')
		expect(response.message).toBe(VALIDATION_MESSAGE)
		expect(response.errors).toBeInstanceOf(expectedErrors.constructor)
		expect((response.errors as Error).message).toBe(expectedErrors.message)
	})

	test('non-ZodError branch: still throws BadRequestException with the same code and PT-BR message', () => {
		const schema = z.object({ name: z.string() }).transform(() => {
			throw new Error('boom - not a zod error')
		})
		const pipe = new ZodValidationPipe(schema)

		const thrown = captureThrow(() => pipe.transform({ name: 'ok' }))

		expect(thrown.getStatus()).toBe(400)
		expect(thrown.getResponse()).toEqual({
			code: 'VALIDATION_ERROR',
			message: VALIDATION_MESSAGE,
		})
	})
})
