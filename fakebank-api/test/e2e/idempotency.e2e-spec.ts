import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { prisma } from '../support/database'

const validBody = { externalReference: 'payment-123', amountMinor: 1500, currency: 'BRL' }

describe('Provider Transactions: idempotency', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	function create(
		idempotencyKey: string,
		body: unknown = validBody,
		client: { apiKey: string } = TEST_CLIENTS.paylab,
	) {
		return request(app.getHttpServer())
			.post('/v1/transactions')
			.set('Authorization', bearer(client))
			.set('Idempotency-Key', idempotencyKey)
			.send(body as object)
	}

	async function snapshot() {
		return {
			transactions: await prisma.providerTransaction.findMany({ orderBy: { createdAt: 'asc' } }),
			events: await prisma.providerTransactionEvent.findMany({ orderBy: { sequence: 'asc' } }),
		}
	}

	// AC-4: catches a retry creating a second Provider Transaction, or not being flagged a replay.
	it('replays the same request with 200, Idempotent-Replayed and the same transaction', async () => {
		const key = randomUUID()
		const first = await create(key)

		const replay = await create(key)

		expect(first.status).toBe(201)
		expect(first.headers['idempotent-replayed']).toBeUndefined()
		expect(replay.status).toBe(200)
		expect(replay.headers['idempotent-replayed']).toBe('true')
		expect(replay.body).toEqual(first.body)
		const { transactions, events } = await snapshot()
		expect(transactions).toHaveLength(1)
		expect(events).toHaveLength(2)
	})

	// AC-4: catches a replay answering from a stored copy of the first response.
	it('replays the current status, not the status at creation', async () => {
		const key = randomUUID()
		const first = await create(key)
		// Until the lab advance endpoint exists (T7), change the state directly. The CHECK
		// constraints require failure_code with FAILED and keep completed_at set.
		await prisma.$executeRaw`
			UPDATE provider_transaction
			SET status = 'FAILED', failure_code = 'INSUFFICIENT_FUNDS',
			    updated_at = '2026-10-22T12:00:00.000Z'
			WHERE id = ${first.body.providerTransactionId}`

		const replay = await create(key)

		expect(replay.status).toBe(200)
		expect(replay.body).toEqual({
			...first.body,
			status: 'FAILED',
			failureCode: 'INSUFFICIENT_FUNDS',
			updatedAt: '2026-10-22T12:00:00.000Z',
		})
	})

	// AC-5: catches key reuse with a different request silently creating, replaying or mutating.
	it.each([
		['a different External Reference', { ...validBody, externalReference: 'payment-456' }],
		['a different Amount', { ...validBody, amountMinor: 1501 }],
	])(
		'answers 409 IDEMPOTENCY_KEY_REUSED for %s and leaves the original unchanged',
		async (_case, body) => {
			const key = randomUUID()
			await create(key)
			const before = await snapshot()

			const response = await create(key, body)

			expect(response.status).toBe(409)
			expect(response.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', retryable: false })
			expect(response.headers['idempotent-replayed']).toBeUndefined()
			expect(await snapshot()).toEqual(before)
		},
	)

	// AC-5 (currency): BRL is the only supported currency and validation precedes the
	// idempotency step (PRD attempt pipeline), so a different currency is refused as 422
	// before the key is looked at. Catches a non-BRL retry mutating or replaying the original.
	it('refuses a reused key with a different currency as 422 and leaves the original unchanged', async () => {
		const key = randomUUID()
		await create(key)
		const before = await snapshot()

		const response = await create(key, { ...validBody, currency: 'USD' })

		expect(response.status).toBe(422)
		expect(response.body.code).toBe('UNSUPPORTED_CURRENCY')
		expect(await snapshot()).toEqual(before)
	})

	// AC-6: catches keys colliding across Clients, or a replay leaking another Client's transaction.
	it('scopes Idempotency Keys per Client', async () => {
		const key = randomUUID()
		const paylab = await create(key, validBody, TEST_CLIENTS.paylab)
		const other = await create(key, validBody, TEST_CLIENTS.other)

		expect(paylab.status).toBe(201)
		expect(other.status).toBe(201)
		expect(other.body.providerTransactionId).not.toBe(paylab.body.providerTransactionId)

		const paylabReplay = await create(key, validBody, TEST_CLIENTS.paylab)
		const otherReplay = await create(key, validBody, TEST_CLIENTS.other)

		expect(paylabReplay.status).toBe(200)
		expect(paylabReplay.body.providerTransactionId).toBe(paylab.body.providerTransactionId)
		expect(otherReplay.status).toBe(200)
		expect(otherReplay.body.providerTransactionId).toBe(other.body.providerTransactionId)
	})
})
