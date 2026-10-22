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
 * `created`: this attempt persisted a new Provider Transaction (`201`).
 * `replayed`: the Client already had one under this Idempotency Key with the same request; it is
 * returned in its current state (`200`, `Idempotent-Replayed: true`) and nothing else happens.
 */
export type CreateProviderTransactionResult =
	| { kind: 'created'; transaction: ProviderTransaction }
	| { kind: 'replayed'; transaction: ProviderTransaction }

/**
 * The creation attempt pipeline (authentication and schema validation already happened in the
 * HTTP layer), in PRD order:
 *   1. business validation (currency);
 *   2. pre-persistence Outcomes (T6: RATE_LIMIT, ERROR_BEFORE_COMMIT), which apply even when the
 *      key already has a Provider Transaction, so they belong before step 3;
 *   3. idempotency: insert, and on a (client, key) conflict load the existing row and compare
 *      fingerprints (409 on mismatch, replay on match). A replay returns here and skips every
 *      later step (no scenario consumption, no delay);
 *   4. new row only: post-persistence behavior (T6: delay, ERROR_AFTER_COMMIT).
 */
@Injectable()
export class CreateProviderTransactionService {
	constructor(
		private readonly repository: ProviderTransactionRepository,
		@Inject(DOMAIN_CLOCK) private readonly clock: DomainClock,
	) {}

	async execute(
		command: CreateProviderTransactionCommand,
	): Promise<CreateProviderTransactionResult> {
		if (command.currency !== SUPPORTED_CURRENCY) {
			throw new HttpException(
				{ code: 'UNSUPPORTED_CURRENCY', message: `Only ${SUPPORTED_CURRENCY} is supported.` },
				HttpStatus.UNPROCESSABLE_ENTITY,
			)
		}

		// Step 2 (T6) hooks here: pre-persistence Outcomes.

		const fingerprint = requestFingerprint(command)
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

		const inserted = await this.repository.insertWithEvents(
			{
				id: final.id,
				clientId: command.clientId,
				externalReference: command.externalReference,
				idempotencyKey: command.idempotencyKey,
				requestFingerprint: fingerprint,
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
		if (inserted) {
			// Step 4 (T6) hooks here: post-persistence behavior of a new row only.
			return { kind: 'created', transaction: inserted }
		}

		return this.replay(command, fingerprint)
	}

	// Built from the current row, never from a stored response: the first attempt may never
	// have produced one, and the status may have moved since.
	private async replay(
		command: CreateProviderTransactionCommand,
		fingerprint: string,
	): Promise<CreateProviderTransactionResult> {
		const existing = await this.repository.findByIdempotencyKey(
			command.clientId,
			command.idempotencyKey,
		)
		if (!existing) {
			// Unreachable: the conflicting row was committed (rows are never deleted) before the
			// unique violation was raised.
			throw new Error('Idempotency Key conflict without a Provider Transaction')
		}
		if (existing.requestFingerprint !== fingerprint) {
			throw new HttpException(
				{
					code: 'IDEMPOTENCY_KEY_REUSED',
					message: 'This Idempotency Key was already used with a different request.',
				},
				HttpStatus.CONFLICT,
			)
		}
		return { kind: 'replayed', transaction: existing }
	}
}

/** What an idempotent retry must repeat exactly: External Reference, Amount and currency. */
export function requestFingerprint(body: CreateProviderTransactionBody): string {
	const canonical = JSON.stringify([body.externalReference, body.amountMinor, body.currency])
	return createHash('sha256').update(canonical).digest('hex')
}
