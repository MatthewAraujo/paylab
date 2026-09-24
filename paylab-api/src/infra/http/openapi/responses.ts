import { ApiProperty } from '@nestjs/swagger'

// Documentation-only shapes of the JSON the read routes return. The presenters stay the
// runtime source of truth; test/e2e/openapi-contract.e2e-spec.ts fails if a real response
// and its documented schema drift apart. Money is always integer centavos.

export const PAYMENT_STATUSES = ['CREATED', 'PROCESSING', 'SUCCEEDED', 'FAILED'] as const
export const ENTRY_DIRECTIONS = ['DEBIT', 'CREDIT'] as const

const CENTAVOS = 'Integer centavos, never a decimal.'
const NEXT_CURSOR = 'Pass as `cursor` to get the following page; null on the last page.'

export class AccountResponse {
	@ApiProperty({ format: 'uuid' }) id!: string
	@ApiProperty({ example: 'WALLET' }) kind!: string
	@ApiProperty({ example: 'BRL' }) currency!: string
}

export class WalletListItemResponse {
	@ApiProperty({ format: 'uuid' }) id!: string
	@ApiProperty({ example: 'WALLET' }) kind!: string
	@ApiProperty({ example: 'BRL' }) currency!: string
	@ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class WalletPageResponse {
	@ApiProperty({ type: [WalletListItemResponse] }) items!: WalletListItemResponse[]
	@ApiProperty({ type: String, nullable: true, description: NEXT_CURSOR }) nextCursor!:
		| string
		| null
}

export class BalanceResponse {
	@ApiProperty({ format: 'uuid' }) accountId!: string
	@ApiProperty({ description: `Credits minus debits. ${CENTAVOS}` }) balance!: number
	@ApiProperty({ example: 'BRL' }) currency!: string
}

export class LedgerEntryResponse {
	@ApiProperty({ format: 'uuid' }) id!: string
	@ApiProperty({ format: 'uuid' }) ledgerTransactionId!: string
	@ApiProperty({ enum: ENTRY_DIRECTIONS }) direction!: 'DEBIT' | 'CREDIT'
	@ApiProperty({ description: `Always positive; the sign comes from direction. ${CENTAVOS}` })
	amount!: number
	@ApiProperty({ format: 'date-time' }) createdAt!: string
}

export class LedgerEntryPageResponse {
	@ApiProperty({ type: [LedgerEntryResponse] }) items!: LedgerEntryResponse[]
	@ApiProperty({ type: String, nullable: true, description: NEXT_CURSOR }) nextCursor!:
		| string
		| null
}

export class PaymentResponse {
	@ApiProperty({ format: 'uuid' }) id!: string
	@ApiProperty({ format: 'uuid' }) sourceAccountId!: string
	@ApiProperty({ format: 'uuid' }) destinationAccountId!: string
	@ApiProperty({ description: CENTAVOS }) amount!: number
	@ApiProperty({ example: 'BRL' }) currency!: string
	@ApiProperty({ enum: PAYMENT_STATUSES }) status!: string
	@ApiProperty({ type: String, nullable: true, example: 'INSUFFICIENT_FUNDS' }) failureReason!:
		| string
		| null
	@ApiProperty({ type: String, format: 'uuid', nullable: true }) ledgerTransactionId!: string | null
	@ApiProperty({ format: 'date-time' }) createdAt!: string
	@ApiProperty({ format: 'date-time' }) updatedAt!: string
}

export class PaymentPageResponse {
	@ApiProperty({ type: [PaymentResponse] }) items!: PaymentResponse[]
	@ApiProperty({ type: String, nullable: true, description: NEXT_CURSOR }) nextCursor!:
		| string
		| null
}

export class DailyReportRowResponse {
	@ApiProperty({ example: '2026-09-01', description: 'UTC calendar day.' }) date!: string
	@ApiProperty({ enum: PAYMENT_STATUSES }) status!: string
	@ApiProperty() count!: number
	@ApiProperty({ description: `Sum of the Payments' amounts. ${CENTAVOS}` }) volume!: number
}

export class DailyReportResponse {
	@ApiProperty({ example: '2026-09-01' }) from!: string
	@ApiProperty({ example: '2026-09-30' }) to!: string
	@ApiProperty({ type: [DailyReportRowResponse] }) items!: DailyReportRowResponse[]
}

/** Domain errors: 403 and 404 (not found also covers another Merchant's resource). */
export class ErrorResponse {
	@ApiProperty({ example: 'RESOURCE_NOT_FOUND' }) code!: string
	@ApiProperty() message!: string
}

/** Query or path validation failure (422). */
export class ValidationErrorResponse {
	@ApiProperty({ example: 422 }) statusCode!: number
	@ApiProperty({ example: 'VALIDATION_ERROR' }) code!: string
	@ApiProperty() message!: string
	@ApiProperty({ required: false, description: 'Field-level details when available.' })
	errors?: unknown
}

/** Missing or invalid API key (401): one generic body so a wrong key looks like a missing one. */
export class UnauthorizedResponse {
	@ApiProperty({ example: 401 }) statusCode!: number
	@ApiProperty({ example: 'Invalid API key' }) message!: string
	@ApiProperty({ example: 'Unauthorized' }) error!: string
}
