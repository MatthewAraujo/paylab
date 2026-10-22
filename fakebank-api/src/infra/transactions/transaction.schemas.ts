import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { z } from 'zod'

export const SUPPORTED_CURRENCY = 'BRL'

// Stored and matched exactly as sent (no trimming), but never blank.
export const externalReference = z
	.string({ required_error: 'Required', invalid_type_error: 'Must be a single string' })
	.min(1)
	.max(128)
	.refine((value) => value.trim().length > 0, 'Must not be blank')

// AC-3: shape violations are 400. A well-formed currency other than BRL passes the schema and
// is refused as 422 UNSUPPORTED_CURRENCY by the creation service.
export const createProviderTransactionBody = z.object({
	externalReference,
	amountMinor: z.number().int().positive().safe(),
	currency: z.string().regex(/^[A-Z]{3}$/, 'Must be an ISO 4217 code such as BRL'),
})

export type CreateProviderTransactionBody = z.infer<typeof createProviderTransactionBody>

// AC-8: a missing filter is a 400, never a listing of every transaction of the Client.
export const listByExternalReferenceQuery = z.object({ externalReference })

export type ListByExternalReferenceQuery = z.infer<typeof listByExternalReferenceQuery>

export const idempotencyKeyHeader = z.string({ required_error: 'Required' }).min(1).max(255)

/** The raw `Idempotency-Key` header (undefined when absent); validate it with a pipe. */
export const IdempotencyKey = createParamDecorator(
	(_data: unknown, context: ExecutionContext): string | undefined => {
		const header = context.switchToHttp().getRequest().headers['idempotency-key']
		return typeof header === 'string' ? header : undefined
	},
)
