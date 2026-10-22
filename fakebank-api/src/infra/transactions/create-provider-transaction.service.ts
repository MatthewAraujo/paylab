import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import {
	DomainClock,
	createProviderTransaction,
	transitionProviderTransaction,
} from '@/domain/provider-transaction'
import { HttpExceptionWithHeaders } from '@/infra/http/errors/http-exception-with-headers'
import {
	IMMEDIATE_SUCCESS,
	NewTransactionDecision,
	PrePersistenceDecision,
	ScenarioAttempts,
} from '@/infra/scenarios/scenario-attempts.service'
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
 * `created`: this attempt persisted a new Provider Transaction (`201`, or `202` while it is still
 * `PROCESSING`: a deferred decision).
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
 *   2. pre-persistence Outcomes (RATE_LIMIT, ERROR_BEFORE_COMMIT), which apply even when the
 *      key already has a Provider Transaction, so they belong before step 3: one attempt is
 *      consumed (autocommitted), then `delayMs`, then the 429/503 with nothing persisted;
 *   3. idempotency: insert, and on a (client, key) conflict load the existing row and compare
 *      fingerprints (409 on mismatch, replay on match). A replay returns here and skips every
 *      later step (no scenario consumption, no delay);
 *      For a new row, a scenario attempt is consumed and its Outcome decided (FAIL, DEFERRED, ...)
 *      inside the insert's database transaction;
 *   4. new row only, after commit: wait `delayMs`, then answer (500 for ERROR_AFTER_COMMIT).
 *      No delay ever runs inside an open database transaction.
 */
@Injectable()
export class CreateProviderTransactionService {
	constructor(
		private readonly repository: ProviderTransactionRepository,
		private readonly scenarioAttempts: ScenarioAttempts,
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

		const prePersistence = await this.scenarioAttempts.decideBeforePersistence(
			command.clientId,
			command.externalReference,
		)
		if (prePersistence) {
			await sleep(prePersistence.delayMs)
			throw transportError(prePersistence)
		}

		const fingerprint = requestFingerprint(command)
		let decision: NewTransactionDecision = IMMEDIATE_SUCCESS
		const inserted = await this.repository.insertWithEvents(async (db) => {
			// Step 3 consumes the scenario attempt in the insert's database transaction: a key
			// conflict rolls it back, so a replay never consumes one.
			decision = await this.scenarioAttempts.decideNewTransaction(
				db,
				command.clientId,
				command.externalReference,
			)
			return this.decidedTransaction(command, fingerprint, decision)
		})
		if (inserted) {
			// Step 4, new row only: the database transaction has committed, so a Client that gives
			// up during the delay leaves this Provider Transaction behind (AC-19).
			await sleep(decision.delayMs)
			if (decision.appliedOutcome === 'ERROR_AFTER_COMMIT') {
				// AC-18: the work is persisted; only the response fails.
				throw new HttpException(
					{ code: 'PROVIDER_INTERNAL_ERROR', message: 'The provider failed to respond.' },
					HttpStatus.INTERNAL_SERVER_ERROR,
				)
			}
			return { kind: 'created', transaction: inserted }
		}

		return this.replay(command, fingerprint)
	}

	/** A new Provider Transaction (always created PROCESSING) after the decided transition. */
	private decidedTransaction(
		command: CreateProviderTransactionCommand,
		fingerprint: string,
		decision: NewTransactionDecision,
	) {
		const created = createProviderTransaction({ id: newProviderTransactionId() }, this.clock)
		let final = created.transaction
		const events = [created.event]
		if (decision.transition) {
			const transitioned = transitionProviderTransaction(final, decision.transition, this.clock)
			if (!transitioned.ok) {
				// Unreachable: a new transaction is PROCESSING, and the scenario schema and a CHECK
				// constraint guarantee FAIL's Failure Code.
				throw new Error(`Decided transition refused: ${transitioned.error.code}`)
			}
			final = transitioned.value.transaction
			events.push(transitioned.value.event)
		}
		return {
			transaction: {
				id: final.id,
				clientId: command.clientId,
				externalReference: command.externalReference,
				idempotencyKey: command.idempotencyKey,
				requestFingerprint: fingerprint,
				amountMinor: BigInt(command.amountMinor),
				currency: command.currency,
				status: final.status,
				failureCode: final.failureCode,
				appliedOutcome: decision.appliedOutcome,
				createdAt: final.createdAt,
				updatedAt: final.completedAt ?? final.createdAt,
				completedAt: final.completedAt,
			},
			events,
		}
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

/** The error answering a pre-persistence Outcome; nothing was persisted. */
function transportError(decision: PrePersistenceDecision): HttpException {
	if (decision.outcome === 'ERROR_BEFORE_COMMIT') {
		return new HttpException(
			{ code: 'PROVIDER_UNAVAILABLE', message: 'The provider is temporarily unavailable.' },
			HttpStatus.SERVICE_UNAVAILABLE,
		)
	}
	return new HttpExceptionWithHeaders(
		{ code: 'PROVIDER_RATE_LIMIT', message: 'Too many requests; retry after the indicated delay.' },
		HttpStatus.TOO_MANY_REQUESTS,
		{ 'Retry-After': String(decision.retryAfterSeconds) },
	)
}

/** What an idempotent retry must repeat exactly: External Reference, Amount and currency. */
export function requestFingerprint(body: CreateProviderTransactionBody): string {
	const canonical = JSON.stringify([body.externalReference, body.amountMinor, body.currency])
	return createHash('sha256').update(canonical).digest('hex')
}
