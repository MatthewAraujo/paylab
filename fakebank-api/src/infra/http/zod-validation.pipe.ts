import { HttpException, HttpStatus, PipeTransform } from '@nestjs/common'
import { ZodSchema } from 'zod'

/**
 * Parses a request part with a Zod schema; any violation is `400 VALIDATION_ERROR` (AC-3) naming
 * the offending fields. `label` prefixes field paths, e.g. `Idempotency-Key` for a header.
 */
export class ZodValidationPipe implements PipeTransform {
	constructor(
		private readonly schema: ZodSchema,
		private readonly label?: string,
	) {}

	transform(value: unknown) {
		const result = this.schema.safeParse(value)
		if (result.success) {
			return result.data
		}

		const message = result.error.issues
			.map((issue) => {
				const path = [this.label, ...issue.path].filter((part) => part !== undefined).join('.')
				return path ? `${path}: ${issue.message}` : issue.message
			})
			.join('; ')
		throw new HttpException({ code: 'VALIDATION_ERROR', message }, HttpStatus.BAD_REQUEST)
	}
}
