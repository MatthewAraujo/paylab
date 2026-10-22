/** What a Simulation Scenario makes FakeBank do with an attempt (see CONTEXT.md, Outcome). */
export const OUTCOMES = [
	'SUCCEED',
	'FAIL',
	'DEFERRED',
	'RATE_LIMIT',
	'ERROR_BEFORE_COMMIT',
	'ERROR_AFTER_COMMIT',
] as const

export type Outcome = (typeof OUTCOMES)[number]

/**
 * Outcomes applied to an attempt that persists a new Provider Transaction, consumed inside its
 * database transaction. The others (`PRE_PERSISTENCE_OUTCOMES`) are consumed before it.
 */
export const PERSISTED_OUTCOMES: readonly Outcome[] = [
	'SUCCEED',
	'FAIL',
	'DEFERRED',
	'ERROR_AFTER_COMMIT',
]

/**
 * Outcomes applied before anything is persisted, even when the Idempotency Key already has a
 * Provider Transaction (AC-21): the attempt is answered with a transport error.
 */
export const PRE_PERSISTENCE_OUTCOMES = ['RATE_LIMIT', 'ERROR_BEFORE_COMMIT'] as const

export type PrePersistenceOutcome = (typeof PRE_PERSISTENCE_OUTCOMES)[number]
