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
 * database transaction. The others (`RATE_LIMIT`, `ERROR_BEFORE_COMMIT`) apply before
 * persistence, even on an idempotent replay, and are consumed there (T8).
 */
export const PERSISTED_OUTCOMES: readonly Outcome[] = [
	'SUCCEED',
	'FAIL',
	'DEFERRED',
	'ERROR_AFTER_COMMIT',
]
