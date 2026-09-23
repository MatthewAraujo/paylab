import { ExecutionContext, createParamDecorator } from '@nestjs/common'

/**
 * The raw `Idempotency-Key` header. Pass a pipe to validate it, e.g.
 * `@IdempotencyKey(new ZodValidationPipe(schema))`; a missing header arrives as undefined.
 */
export const IdempotencyKey = createParamDecorator(
	(_data: unknown, context: ExecutionContext): string | undefined => {
		const header = context.switchToHttp().getRequest().headers['idempotency-key']

		return typeof header === 'string' ? header : undefined
	},
)
