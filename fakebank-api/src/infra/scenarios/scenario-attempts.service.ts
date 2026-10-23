import { PrismaService } from '@/infra/database/prisma.service'
import { EnvService } from '@/infra/env/env.service'
import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import {
	type Outcome,
	PERSISTED_OUTCOMES,
	PRE_PERSISTENCE_OUTCOMES,
	type PrePersistenceOutcome,
} from './outcome'
import {
	type ConsumedScenario,
	SimulationScenarioRepository,
} from './simulation-scenario.repository'

/** The terminal status a new Provider Transaction takes in its creation database transaction. */
export type NewTransactionTransition = { to: 'SUCCEEDED' } | { to: 'FAILED'; failureCode: string }

/** What an attempt that persists a new Provider Transaction does. */
export interface NewTransactionDecision {
	/** The Outcome applied (stored for diagnosis only), or null: no scenario, immediate success. */
	appliedOutcome: Outcome | null
	/** The terminal transition to apply now, or null to leave it `PROCESSING` (`DEFERRED`). */
	transition: NewTransactionTransition | null
	/** Wait after commit before answering. */
	delayMs: number
}

/** A transport error to answer before anything is persisted (RATE_LIMIT, ERROR_BEFORE_COMMIT). */
export interface PrePersistenceDecision {
	outcome: PrePersistenceOutcome
	/** Wait before answering the error. */
	delayMs: number
	/** `Retry-After` for RATE_LIMIT: the scenario's value, or 1. */
	retryAfterSeconds: number
}

const DEFAULT_RETRY_AFTER_SECONDS = 1

export const IMMEDIATE_SUCCESS: NewTransactionDecision = {
	appliedOutcome: null,
	transition: { to: 'SUCCEEDED' },
	delayMs: 0,
}

/**
 * The Outcome decision of the creation attempt pipeline. Scenarios exist only behind the lab
 * flag: with the lab off, nothing is consumed and every attempt is an immediate success, even
 * if scenarios were left in the database.
 */
@Injectable()
export class ScenarioAttempts {
	constructor(
		private readonly scenarios: SimulationScenarioRepository,
		private readonly env: EnvService,
		private readonly prisma: PrismaService,
	) {}

	/**
	 * Consumes an attempt of a pre-persistence scenario, if one applies, before the idempotency
	 * step. One autocommitted conditional statement: no database transaction stays open while
	 * the caller waits `delayMs`, and parallel attempts never share one (AC-22).
	 */
	async decideBeforePersistence(
		clientId: string,
		externalReference: string,
	): Promise<PrePersistenceDecision | null> {
		if (!this.env.get('FAKEBANK_LAB_ENABLED')) {
			return null
		}
		const consumed = await this.scenarios.consumeAttempt(
			this.prisma,
			clientId,
			externalReference,
			PRE_PERSISTENCE_OUTCOMES,
		)
		if (!consumed) {
			return null
		}
		return {
			outcome: consumed.outcome,
			delayMs: consumed.delayMs,
			retryAfterSeconds: consumed.retryAfterSeconds ?? DEFAULT_RETRY_AFTER_SECONDS,
		}
	}

	/** Consumes an attempt for a new Provider Transaction, inside its database transaction. */
	async decideNewTransaction(
		db: Prisma.TransactionClient,
		clientId: string,
		externalReference: string,
	): Promise<NewTransactionDecision> {
		if (!this.env.get('FAKEBANK_LAB_ENABLED')) {
			return IMMEDIATE_SUCCESS
		}
		const consumed = await this.scenarios.consumeAttempt(
			db,
			clientId,
			externalReference,
			PERSISTED_OUTCOMES,
		)
		return consumed ? decide(consumed) : IMMEDIATE_SUCCESS
	}
}

function decide(scenario: ConsumedScenario): NewTransactionDecision {
	const base = { appliedOutcome: scenario.outcome, delayMs: scenario.delayMs }
	switch (scenario.outcome) {
		case 'FAIL':
			return { ...base, transition: { to: 'FAILED', failureCode: scenario.failureCode } }
		case 'DEFERRED':
			return { ...base, transition: null }
		default:
			// SUCCEED, and ERROR_AFTER_COMMIT: the work is done, only the response fails.
			return { ...base, transition: { to: 'SUCCEEDED' } }
	}
}
