// Provider Transaction state machine: pure domain rules, no framework or persistence.

export const PROVIDER_TRANSACTION_STATUSES = ['PROCESSING', 'SUCCEEDED', 'FAILED'] as const

export type ProviderTransactionStatus = (typeof PROVIDER_TRANSACTION_STATUSES)[number]

export type ProviderTransactionEventType =
	| 'transaction.processing'
	| 'transaction.succeeded'
	| 'transaction.failed'

export interface ProviderTransactionState {
	id: string
	status: ProviderTransactionStatus
	failureCode: string | null
	createdAt: Date
	completedAt: Date | null
}

export interface ProviderTransactionEvent {
	id: string
	providerTransactionId: string
	type: ProviderTransactionEventType
	status: ProviderTransactionStatus
	failureCode: string | null
	occurredAt: Date
}

/** Injected so ids and timestamps stay deterministic in tests. */
export interface DomainClock {
	now: () => Date
	newEventId: () => string
}

export interface ProviderTransactionChange<T extends ProviderTransactionState> {
	transaction: T
	event: ProviderTransactionEvent
}

const EVENT_TYPE: Record<ProviderTransactionStatus, ProviderTransactionEventType> = {
	PROCESSING: 'transaction.processing',
	SUCCEEDED: 'transaction.succeeded',
	FAILED: 'transaction.failed',
}

function eventFor(
	transaction: ProviderTransactionState,
	occurredAt: Date,
	clock: DomainClock,
): ProviderTransactionEvent {
	return {
		id: clock.newEventId(),
		providerTransactionId: transaction.id,
		type: EVENT_TYPE[transaction.status],
		status: transaction.status,
		failureCode: transaction.failureCode,
		occurredAt,
	}
}

/** A new Provider Transaction is always PROCESSING and enters it with one event. */
export function createProviderTransaction(
	input: { id: string },
	clock: DomainClock,
): ProviderTransactionChange<ProviderTransactionState> {
	const createdAt = clock.now()
	const transaction: ProviderTransactionState = {
		id: input.id,
		status: 'PROCESSING',
		failureCode: null,
		createdAt,
		completedAt: null,
	}
	return { transaction, event: eventFor(transaction, createdAt, clock) }
}

/** A requested status change. PROCESSING is accepted as input only so it can be refused. */
export type ProviderTransactionTransition =
	| { to: 'PROCESSING' }
	| { to: 'SUCCEEDED' }
	| { to: 'FAILED'; failureCode: string }

/** Refusals are values, not exceptions; the HTTP layer maps INVALID_TRANSITION to 409. */
export type ProviderTransactionTransitionError =
	| { code: 'INVALID_TRANSITION'; from: ProviderTransactionStatus; to: ProviderTransactionStatus }
	| { code: 'FAILURE_CODE_REQUIRED' }

export type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

export function transitionProviderTransaction<T extends ProviderTransactionState>(
	current: T,
	transition: ProviderTransactionTransition,
	clock: DomainClock,
): Result<ProviderTransactionChange<T>, ProviderTransactionTransitionError> {
	// AC-26: only PROCESSING -> SUCCEEDED and PROCESSING -> FAILED exist.
	if (current.status !== 'PROCESSING' || transition.to === 'PROCESSING') {
		return {
			ok: false,
			error: { code: 'INVALID_TRANSITION', from: current.status, to: transition.to },
		}
	}
	const failureCode = transition.to === 'FAILED' ? transition.failureCode.trim() : null
	if (transition.to === 'FAILED' && !failureCode) {
		return { ok: false, error: { code: 'FAILURE_CODE_REQUIRED' } }
	}
	const completedAt = clock.now()
	const transaction: T = { ...current, status: transition.to, failureCode, completedAt }
	return { ok: true, value: { transaction, event: eventFor(transaction, completedAt, clock) } }
}
