import {
	type ProviderTransactionState,
	type ProviderTransactionTransition,
	createProviderTransaction,
	transitionProviderTransaction,
} from '@/domain/provider-transaction'

const createdAt = new Date('2026-10-20T12:00:00.000Z')
const decidedAt = new Date('2026-10-20T12:00:05.000Z')

function eventIds(...ids: string[]) {
	const queue = [...ids]
	return () => {
		const next = queue.shift()
		if (!next) throw new Error('test ran out of event ids')
		return next
	}
}

describe('Provider Transaction state machine', () => {
	// AC-27: every Provider Transaction starts with exactly one transaction.processing event.
	it('creates a PROCESSING transaction with a single transaction.processing event', () => {
		const result = createProviderTransaction(
			{ id: 'ptx_1' },
			{ now: () => createdAt, newEventId: eventIds('evt_1') },
		)

		expect(result.transaction).toEqual({
			id: 'ptx_1',
			status: 'PROCESSING',
			failureCode: null,
			createdAt,
			completedAt: null,
		})
		expect(result.event).toEqual({
			id: 'evt_1',
			providerTransactionId: 'ptx_1',
			type: 'transaction.processing',
			status: 'PROCESSING',
			failureCode: null,
			occurredAt: createdAt,
		})
	})

	function processing() {
		return createProviderTransaction(
			{ id: 'ptx_1' },
			{ now: () => createdAt, newEventId: eventIds('evt_1') },
		).transaction
	}

	// AC-26: PROCESSING -> SUCCEEDED is allowed, completes the transaction and records it.
	it('moves PROCESSING to SUCCEEDED with completedAt and one transaction.succeeded event', () => {
		const result = transitionProviderTransaction(
			processing(),
			{ to: 'SUCCEEDED' },
			{ now: () => decidedAt, newEventId: eventIds('evt_2') },
		)

		expect(result).toEqual({
			ok: true,
			value: {
				transaction: {
					id: 'ptx_1',
					status: 'SUCCEEDED',
					failureCode: null,
					createdAt,
					completedAt: decidedAt,
				},
				event: {
					id: 'evt_2',
					providerTransactionId: 'ptx_1',
					type: 'transaction.succeeded',
					status: 'SUCCEEDED',
					failureCode: null,
					occurredAt: decidedAt,
				},
			},
		})
	})

	// AC-26: a failure is a provider decision and must say why.
	it('moves PROCESSING to FAILED carrying the Failure Code on the transaction and its event', () => {
		const result = transitionProviderTransaction(
			processing(),
			{ to: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS' },
			{ now: () => decidedAt, newEventId: eventIds('evt_2') },
		)

		expect(result).toEqual({
			ok: true,
			value: {
				transaction: {
					id: 'ptx_1',
					status: 'FAILED',
					failureCode: 'INSUFFICIENT_FUNDS',
					createdAt,
					completedAt: decidedAt,
				},
				event: {
					id: 'evt_2',
					providerTransactionId: 'ptx_1',
					type: 'transaction.failed',
					status: 'FAILED',
					failureCode: 'INSUFFICIENT_FUNDS',
					occurredAt: decidedAt,
				},
			},
		})
	})

	it('refuses to fail a transaction without a Failure Code', () => {
		const newEventId = vi.fn(() => 'evt_2')

		const result = transitionProviderTransaction(
			processing(),
			{ to: 'FAILED', failureCode: '  ' },
			{ now: () => decidedAt, newEventId },
		)

		expect(result).toEqual({ ok: false, error: { code: 'FAILURE_CODE_REQUIRED' } })
		expect(newEventId).not.toHaveBeenCalled()
	})

	function decided(transition: ProviderTransactionTransition) {
		const result = transitionProviderTransaction(processing(), transition, {
			now: () => decidedAt,
			newEventId: eventIds('evt_2'),
		})
		if (!result.ok) throw new Error('setup transition was refused')
		return result.value.transaction
	}

	// AC-26: terminal statuses are final and nothing goes back to PROCESSING.
	it.each<[string, () => ProviderTransactionState, ProviderTransactionTransition]>([
		['SUCCEEDED -> FAILED', () => decided({ to: 'SUCCEEDED' }), { to: 'FAILED', failureCode: 'X' }],
		['FAILED -> SUCCEEDED', () => decided({ to: 'FAILED', failureCode: 'X' }), { to: 'SUCCEEDED' }],
		['SUCCEEDED -> SUCCEEDED', () => decided({ to: 'SUCCEEDED' }), { to: 'SUCCEEDED' }],
		[
			'FAILED -> FAILED',
			() => decided({ to: 'FAILED', failureCode: 'X' }),
			{ to: 'FAILED', failureCode: 'Y' },
		],
		['PROCESSING -> PROCESSING', () => processing(), { to: 'PROCESSING' }],
		['SUCCEEDED -> PROCESSING', () => decided({ to: 'SUCCEEDED' }), { to: 'PROCESSING' }],
		[
			'FAILED -> PROCESSING',
			() => decided({ to: 'FAILED', failureCode: 'X' }),
			{ to: 'PROCESSING' },
		],
	])('refuses %s with INVALID_TRANSITION and no event', (_, current, transition) => {
		const from = current()
		const newEventId = vi.fn(() => 'evt_3')

		const result = transitionProviderTransaction(from, transition, {
			now: () => decidedAt,
			newEventId,
		})

		expect(result).toEqual({
			ok: false,
			error: { code: 'INVALID_TRANSITION', from: from.status, to: transition.to },
		})
		expect(newEventId).not.toHaveBeenCalled()
	})

	// AC-27: an immediate decision records processing first, then the terminal status.
	it('records transaction.processing before the terminal event on an immediate decision', () => {
		const instants = [createdAt, decidedAt]
		const clock = { now: () => instants.shift() as Date, newEventId: eventIds('evt_1', 'evt_2') }

		const created = createProviderTransaction({ id: 'ptx_1' }, clock)
		const decision = transitionProviderTransaction(created.transaction, { to: 'SUCCEEDED' }, clock)
		if (!decision.ok) throw new Error('immediate success was refused')

		expect(
			[created.event, decision.value.event].map(({ id, type, occurredAt }) => ({
				id,
				type,
				occurredAt,
			})),
		).toEqual([
			{ id: 'evt_1', type: 'transaction.processing', occurredAt: createdAt },
			{ id: 'evt_2', type: 'transaction.succeeded', occurredAt: decidedAt },
		])
	})
})
