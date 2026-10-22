import { EnvService } from '@/infra/env/env.service'
import { Injectable } from '@nestjs/common'
import type { Prisma } from '@prisma/client'
import { type Outcome, PERSISTED_OUTCOMES } from './outcome'
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
	/** Wait after commit before answering (T8). */
	delayMs: number
}

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
	) {}

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
			// The registration schema and a CHECK constraint guarantee the Failure Code for FAIL.
			return { ...base, transition: { to: 'FAILED', failureCode: scenario.failureCode ?? '' } }
		case 'DEFERRED':
			return { ...base, transition: null }
		default:
			// SUCCEED, and ERROR_AFTER_COMMIT: the work is done, only the response fails (T8).
			return { ...base, transition: { to: 'SUCCEEDED' } }
	}
}
