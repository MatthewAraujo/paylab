import { createHash } from 'node:crypto'
import {
	DomainClock,
	createProviderTransaction,
	transitionProviderTransaction,
} from '@/domain/provider-transaction'
import { HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common'
import type { ProviderTransaction } from '@prisma/client'
import { DOMAIN_CLOCK } from './domain-clock'
import { newProviderTransactionId } from './provider-transaction-id'
import { ProviderTransactionRepository } from './provider-transaction.repository'
import { CreateProviderTransactionBody, SUPPORTED_CURRENCY } from './transaction.schemas'

export interface CreateProviderTransactionCommand extends CreateProviderTransactionBody {
	clientId: string
	idempotencyKey: string
}

/**
 * The creation attempt pipeline (authentication and schema validation already happened in the
 * HTTP layer). Today: business validation → create PROCESSING → immediate success → persist with
 * both events atomically. Idempotency (T4) and Simulation Scenarios (T5/T6) extend this flow.
 */
@Injectable()
export class CreateProviderTransactionService {
	constructor(
		private readonly repository: ProviderTransactionRepository,
		@Inject(DOMAIN_CLOCK) private readonly clock: DomainClock,
	) {}

	async execute(command: CreateProviderTransactionCommand): Promise<ProviderTransaction> {
		if (command.currency !== SUPPORTED_CURRENCY) {
			throw new HttpException(
				{ code: 'UNSUPPORTED_CURRENCY', message: `Only ${SUPPORTED_CURRENCY} is supported.` },
				HttpStatus.UNPROCESSABLE_ENTITY,
			)
		}

		const created = createProviderTransaction({ id: newProviderTransactionId() }, this.clock)
		const succeeded = transitionProviderTransaction(
			created.transaction,
			{ to: 'SUCCEEDED' },
			this.clock,
		)
		if (!succeeded.ok) {
			// Unreachable: a new transaction is PROCESSING, and PROCESSING -> SUCCEEDED is allowed.
			throw new Error(`Immediate success refused: ${succeeded.error.code}`)
		}
		const final = succeeded.value.transaction

		return this.repository.insertWithEvents(
			{
				id: final.id,
				clientId: command.clientId,
				externalReference: command.externalReference,
				idempotencyKey: command.idempotencyKey,
				requestFingerprint: requestFingerprint(command),
				amountMinor: BigInt(command.amountMinor),
				currency: command.currency,
				status: final.status,
				failureCode: final.failureCode,
				createdAt: final.createdAt,
				updatedAt: final.completedAt ?? final.createdAt,
				completedAt: final.completedAt,
			},
			[created.event, succeeded.value.event],
		)
	}
}

/** What an idempotent retry must repeat exactly: External Reference, Amount and currency. */
export function requestFingerprint(body: CreateProviderTransactionBody): string {
	const canonical = JSON.stringify([body.externalReference, body.amountMinor, body.currency])
	return createHash('sha256').update(canonical).digest('hex')
}
