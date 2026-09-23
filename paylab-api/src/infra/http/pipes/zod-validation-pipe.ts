import { BadRequestException, PipeTransform } from '@nestjs/common'
import { ZodError, ZodSchema } from 'zod'
import { fromZodError } from 'zod-validation-error'

const VALIDATION_ERROR_MESSAGE = 'Dados inválidos. Verifique os campos e tente novamente.'

export class ZodValidationPipe implements PipeTransform {
	constructor(private schema: ZodSchema) {}

	transform(value: unknown) {
		try {
			return this.schema.parse(value)
		} catch (error) {
			if (error instanceof ZodError) {
				throw new BadRequestException({
					message: VALIDATION_ERROR_MESSAGE,
					statusCode: 400,
					code: 'VALIDATION_ERROR',
					errors: fromZodError(error),
				})
			}

			throw new BadRequestException({
				message: VALIDATION_ERROR_MESSAGE,
				code: 'VALIDATION_ERROR',
			})
		}
	}
}
