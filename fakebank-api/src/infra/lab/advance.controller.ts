import { AuthenticatedClient, CurrentClient } from '@/infra/auth/authenticated-client'
import { ClientAuthenticated } from '@/infra/auth/client-authenticated.decorator'
import { ErrorEnvelopeResponse } from '@/infra/http/openapi/error-envelope.response'
import { ZodValidationPipe } from '@/infra/http/zod-validation.pipe'
import {
	ProviderTransactionResponse,
	toProviderTransactionResponse,
} from '@/infra/transactions/provider-transaction.representation'
import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common'
import {
	ApiBadRequestResponse,
	ApiBody,
	ApiConflictResponse,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiProperty,
	ApiPropertyOptional,
	ApiTags,
} from '@nestjs/swagger'
import { AdvanceProviderTransactionService } from './advance-provider-transaction.service'
import { ADVANCE_STATUSES, AdvanceBody, advanceBody } from './advance.schemas'

/** Documentation-only shape of the advance request; runtime validation is the Zod schema. */
export class AdvanceProviderTransactionRequest {
	@ApiProperty({ enum: ADVANCE_STATUSES })
	status!: string

	@ApiPropertyOptional({
		example: 'ACCOUNT_BLOCKED',
		maxLength: 64,
		description: 'Required for FAILED; refused for SUCCEEDED.',
	})
	failureCode?: string
}

@ApiTags('lab')
@ClientAuthenticated()
@Controller('__test/transactions')
export class AdvanceController {
	constructor(private readonly advanceProviderTransaction: AdvanceProviderTransactionService) {}

	@Post(':providerTransactionId/advance')
	@HttpCode(HttpStatus.OK)
	@ApiBody({ type: AdvanceProviderTransactionRequest })
	@ApiOkResponse({
		description: 'The PROCESSING Provider Transaction was decided; returns its new state.',
		type: ProviderTransactionResponse,
	})
	@ApiBadRequestResponse({
		description: 'Invalid status, or FAILED without a Failure Code (VALIDATION_ERROR).',
		type: ErrorEnvelopeResponse,
	})
	@ApiNotFoundResponse({
		description: "Unknown id, or another Client's (TRANSACTION_NOT_FOUND).",
		type: ErrorEnvelopeResponse,
	})
	@ApiConflictResponse({
		description: 'The Provider Transaction is already SUCCEEDED or FAILED (INVALID_TRANSITION).',
		type: ErrorEnvelopeResponse,
	})
	async advance(
		@CurrentClient() client: AuthenticatedClient,
		@Param('providerTransactionId') providerTransactionId: string,
		@Body(new ZodValidationPipe(advanceBody)) decision: AdvanceBody,
	): Promise<ProviderTransactionResponse> {
		const advanced = await this.advanceProviderTransaction.execute({
			clientId: client.clientId,
			providerTransactionId,
			decision,
		})
		return toProviderTransactionResponse(advanced)
	}
}
