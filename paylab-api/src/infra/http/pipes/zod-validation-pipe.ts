import { PipeTransform, UnprocessableEntityException } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'
import { fromZodError } from 'zod-validation-error'

const VALIDATION_ERROR_MESSAGE = 'Invalid request. Check the fields and try again.'

export class ZodValidationPipe implements PipeTransform {
	constructor(private schema: ZodSchema) {}

	transform(value: unknown) {
		try {
			return this.schema.parse(value)
		} catch (error) {
			if (error instanceof ZodError) {
				throw new UnprocessableEntityException({
					message: VALIDATION_ERROR_MESSAGE,
					statusCode: 422,
					code: 'VALIDATION_ERROR',
					errors: fromZodError(error),
				})
			}

			throw new UnprocessableEntityException({
				message: VALIDATION_ERROR_MESSAGE,
				code: 'VALIDATION_ERROR',
			})
		}
	}
}
