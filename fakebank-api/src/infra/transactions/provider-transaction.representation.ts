import { ApiProperty } from '@nestjs/swagger'
import type { ProviderTransaction } from '@prisma/client'

/** The public representation of a Provider Transaction, identical on creation and on reads. */
export class ProviderTransactionResponse {
	@ApiProperty({ example: 'FBK-01929b2e-6f3a-7c1d-9a4f-3f1e2d6c9b7a' })
	providerTransactionId!: string

	@ApiProperty({ example: 'payment-123', description: "The Client's own reference." })
	externalReference!: string

	@ApiProperty({ enum: ['PROCESSING', 'SUCCEEDED', 'FAILED'] })
	status!: string

	@ApiProperty({ example: 1500, description: 'Integer minor units (centavos).' })
	amountMinor!: number

	@ApiProperty({ example: 'BRL' })
	currency!: string

	@ApiProperty({ type: String, nullable: true, example: null })
	failureCode!: string | null

	@ApiProperty({ format: 'date-time' })
	createdAt!: string

	@ApiProperty({ format: 'date-time' })
	updatedAt!: string

	@ApiProperty({ type: String, format: 'date-time', nullable: true })
	completedAt!: string | null
}

export function toProviderTransactionResponse(
	row: ProviderTransaction,
): ProviderTransactionResponse {
	return {
		providerTransactionId: row.id,
		externalReference: row.externalReference,
		status: row.status,
		// Safe: the request schema caps amountMinor at Number.MAX_SAFE_INTEGER.
		amountMinor: Number(row.amountMinor),
		currency: row.currency,
		failureCode: row.failureCode,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
		completedAt: row.completedAt?.toISOString() ?? null,
	}
}

/** AC-8: the lookup by External Reference; oldest first, empty when nothing matches. */
export class ProviderTransactionListResponse {
	@ApiProperty({ type: [ProviderTransactionResponse] })
	data!: ProviderTransactionResponse[]
}

/** Documentation-only shape of the creation request; runtime validation is the Zod schema. */
export class CreateProviderTransactionRequest {
	@ApiProperty({ minLength: 1, maxLength: 128, example: 'payment-123' })
	externalReference!: string

	@ApiProperty({ minimum: 1, maximum: Number.MAX_SAFE_INTEGER, example: 1500 })
	amountMinor!: number

	@ApiProperty({ example: 'BRL', description: 'Only BRL is supported.' })
	currency!: string
}
