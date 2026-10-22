import { AuthenticatedClient, CurrentClient } from '@/infra/auth/authenticated-client'
import { ClientAuthGuard } from '@/infra/auth/client-auth.guard'
import { ErrorEnvelopeResponse } from '@/infra/http/openapi/error-envelope.response'
import { ZodValidationPipe } from '@/infra/http/zod-validation.pipe'
import {
	Body,
	Controller,
	Get,
	HttpCode,
	HttpException,
	HttpStatus,
	Param,
	Post,
	Query,
	Res,
	UseGuards,
} from '@nestjs/common'
import {
	ApiAcceptedResponse,
	ApiBadRequestResponse,
	ApiBearerAuth,
	ApiBody,
	ApiConflictResponse,
	ApiCreatedResponse,
	ApiHeader,
	ApiNotFoundResponse,
	ApiOkResponse,
	ApiQuery,
	ApiTags,
	ApiUnauthorizedResponse,
	ApiUnprocessableEntityResponse,
} from '@nestjs/swagger'
import type { Response } from 'express'
import { CreateProviderTransactionService } from './create-provider-transaction.service'
import { ProviderTransactionRepository } from './provider-transaction.repository'
import {
	CreateProviderTransactionRequest,
	ProviderTransactionListResponse,
	ProviderTransactionResponse,
	toProviderTransactionResponse,
} from './provider-transaction.representation'
import {
	CreateProviderTransactionBody,
	IdempotencyKey,
	ListByExternalReferenceQuery,
	createProviderTransactionBody,
	idempotencyKeyHeader,
	listByExternalReferenceQuery,
} from './transaction.schemas'

const IDEMPOTENT_REPLAYED_HEADER = 'Idempotent-Replayed'

@ApiTags('transactions')
@ApiBearerAuth()
@ApiUnauthorizedResponse({
	description: 'Missing or unknown API key (UNAUTHORIZED).',
	type: ErrorEnvelopeResponse,
})
@UseGuards(ClientAuthGuard)
@Controller('v1/transactions')
export class TransactionsController {
	constructor(
		private readonly createProviderTransaction: CreateProviderTransactionService,
		private readonly repository: ProviderTransactionRepository,
	) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiHeader({
		name: 'Idempotency-Key',
		required: true,
		description: 'Client-chosen key (1–255 characters) identifying one intended transaction.',
	})
	@ApiBody({ type: CreateProviderTransactionRequest })
	@ApiCreatedResponse({
		description: 'The Provider Transaction was created and decided.',
		type: ProviderTransactionResponse,
	})
	@ApiAcceptedResponse({
		description:
			'The Provider Transaction was created but not decided yet: it stays PROCESSING ' +
			'(completedAt null) until the provider decides.',
		type: ProviderTransactionResponse,
	})
	@ApiOkResponse({
		description:
			'Idempotent replay: this Client already sent this request with this Idempotency-Key. ' +
			'Returns that Provider Transaction in its current status.',
		type: ProviderTransactionResponse,
		headers: {
			[IDEMPOTENT_REPLAYED_HEADER]: {
				description: 'Always `true` on a replay; absent on creation.',
				schema: { type: 'string', enum: ['true'] },
			},
		},
	})
	@ApiConflictResponse({
		description:
			'The Idempotency-Key was already used with a different request (IDEMPOTENCY_KEY_REUSED).',
		type: ErrorEnvelopeResponse,
	})
	@ApiBadRequestResponse({
		description: 'Invalid body or Idempotency-Key (VALIDATION_ERROR); nothing is persisted.',
		type: ErrorEnvelopeResponse,
	})
	@ApiUnprocessableEntityResponse({
		description: 'Currency other than BRL (UNSUPPORTED_CURRENCY); nothing is persisted.',
		type: ErrorEnvelopeResponse,
	})
	async create(
		@CurrentClient() client: AuthenticatedClient,
		@IdempotencyKey(new ZodValidationPipe(idempotencyKeyHeader, 'Idempotency-Key'))
		idempotencyKey: string,
		@Body(new ZodValidationPipe(createProviderTransactionBody)) body: CreateProviderTransactionBody,
		@Res({ passthrough: true }) response: Response,
	): Promise<ProviderTransactionResponse> {
		const result = await this.createProviderTransaction.execute({
			...body,
			clientId: client.clientId,
			idempotencyKey,
		})
		if (result.kind === 'replayed') {
			response.status(HttpStatus.OK).setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true')
		} else if (result.transaction.status === 'PROCESSING') {
			// AC-15: persisted, but the provider has not decided yet (DEFERRED).
			response.status(HttpStatus.ACCEPTED)
		}
		return toProviderTransactionResponse(result.transaction)
	}

	@Get()
	@ApiQuery({
		name: 'externalReference',
		required: true,
		description:
			"The Client's own reference (1–128 characters, matched exactly). Not unique: every " +
			'Provider Transaction of this Client carrying it is returned.',
		schema: { type: 'string', minLength: 1, maxLength: 128 },
	})
	@ApiOkResponse({
		description:
			"This Client's Provider Transactions carrying the External Reference, oldest first; " +
			'`data` is empty when none match.',
		type: ProviderTransactionListResponse,
	})
	@ApiBadRequestResponse({
		description: 'Missing, blank or invalid externalReference (VALIDATION_ERROR).',
		type: ErrorEnvelopeResponse,
	})
	async listByExternalReference(
		@CurrentClient() client: AuthenticatedClient,
		@Query(new ZodValidationPipe(listByExternalReferenceQuery)) query: ListByExternalReferenceQuery,
	): Promise<ProviderTransactionListResponse> {
		const transactions = await this.repository.listByExternalReference(
			client.clientId,
			query.externalReference,
		)
		return { data: transactions.map(toProviderTransactionResponse) }
	}

	@Get(':providerTransactionId')
	@ApiOkResponse({
		description: 'The Provider Transaction in its current state.',
		type: ProviderTransactionResponse,
	})
	@ApiNotFoundResponse({
		description: "Unknown id, or another Client's (TRANSACTION_NOT_FOUND).",
		type: ErrorEnvelopeResponse,
	})
	async findById(
		@CurrentClient() client: AuthenticatedClient,
		@Param('providerTransactionId') providerTransactionId: string,
	): Promise<ProviderTransactionResponse> {
		const transaction = await this.repository.findForClient(client.clientId, providerTransactionId)
		if (!transaction) {
			throw new HttpException(
				{ code: 'TRANSACTION_NOT_FOUND', message: 'The Provider Transaction was not found.' },
				HttpStatus.NOT_FOUND,
			)
		}
		return toProviderTransactionResponse(transaction)
	}
}
