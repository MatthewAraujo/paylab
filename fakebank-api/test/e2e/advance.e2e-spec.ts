import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { prisma } from '../support/database'

type Client = { apiKey: string }

// The test layers run with FAKEBANK_LAB_ENABLED=true (setup-env.ts).
describe('advancing a Provider Transaction (lab)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	function create(externalReference: string, idempotencyKey: string = randomUUID()) {
		return request(app.getHttpServer())
			.post('/v1/transactions')
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.set('Idempotency-Key', idempotencyKey)
			.send({ externalReference, amountMinor: 1500, currency: 'BRL' })
	}

	/** A PROCESSING Provider Transaction of the paylab Client, through a DEFERRED scenario. */
	async function deferred(idempotencyKey: string = randomUUID()) {
		await request(app.getHttpServer())
			.post('/__test/scenarios')
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.send({ externalReference: 'PAY-1', outcome: 'DEFERRED' })
			.expect(201)
		const response = await create('PAY-1', idempotencyKey).expect(202)
		return response.body as { providerTransactionId: string; [field: string]: unknown }
	}

	function advance(id: string, body: object, client: Client = TEST_CLIENTS.paylab) {
		return request(app.getHttpServer())
			.post(`/__test/transactions/${id}/advance`)
			.set('Authorization', bearer(client))
			.send(body)
	}

	function read(id: string) {
		return request(app.getHttpServer())
			.get(`/v1/transactions/${id}`)
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
	}

	async function eventsOf(providerTransactionId: string) {
		const events = await prisma.providerTransactionEvent.findMany({
			where: { providerTransactionId },
			orderBy: { sequence: 'asc' },
		})
		return events.map(({ type, status, failureCode }) => ({ type, status, failureCode }))
	}

	describe('a PROCESSING transaction (AC-24, AC-27)', () => {
		// AC-24/AC-27: catches a deferred decision that can never be resolved, or resolved without
		// completedAt or its terminal event.
		it('advances to SUCCEEDED, answering 200 with the new state and recording the event', async () => {
			const pending = await deferred()

			const response = await advance(pending.providerTransactionId, { status: 'SUCCEEDED' })

			expect(response.status).toBe(200)
			expect(response.body).toMatchObject({
				providerTransactionId: pending.providerTransactionId,
				externalReference: 'PAY-1',
				status: 'SUCCEEDED',
				amountMinor: 1500,
				currency: 'BRL',
				failureCode: null,
				createdAt: pending.createdAt,
			})
			expect(response.body.completedAt).toEqual(expect.any(String))
			expect(response.body.updatedAt).toBe(response.body.completedAt)
			expect((await read(pending.providerTransactionId)).body).toEqual(response.body)
			expect(await eventsOf(pending.providerTransactionId)).toEqual([
				{ type: 'transaction.processing', status: 'PROCESSING', failureCode: null },
				{ type: 'transaction.succeeded', status: 'SUCCEEDED', failureCode: null },
			])
		})

		// AC-24/AC-27: catches the failure reason being dropped from the row or its event.
		it('advances to FAILED with the Failure Code', async () => {
			const pending = await deferred()

			const response = await advance(pending.providerTransactionId, {
				status: 'FAILED',
				failureCode: 'ACCOUNT_BLOCKED',
			})

			expect(response.status).toBe(200)
			expect(response.body).toMatchObject({ status: 'FAILED', failureCode: 'ACCOUNT_BLOCKED' })
			expect(response.body.completedAt).toEqual(expect.any(String))
			expect((await read(pending.providerTransactionId)).body).toEqual(response.body)
			expect(await eventsOf(pending.providerTransactionId)).toEqual([
				{ type: 'transaction.processing', status: 'PROCESSING', failureCode: null },
				{ type: 'transaction.failed', status: 'FAILED', failureCode: 'ACCOUNT_BLOCKED' },
			])
		})

		// AC-24: catches an invalid decision being stored.
		it.each([
			['FAILED without failureCode', { status: 'FAILED' }],
			['FAILED with a blank failureCode', { status: 'FAILED', failureCode: '   ' }],
			['failureCode on SUCCEEDED', { status: 'SUCCEEDED', failureCode: 'ACCOUNT_BLOCKED' }],
			['status PROCESSING', { status: 'PROCESSING' }],
			['an unknown status', { status: 'REFUNDED' }],
			['a missing status', {}],
		])('answers 400 VALIDATION_ERROR for %s and leaves it pending', async (_case, body) => {
			const pending = await deferred()

			const response = await advance(pending.providerTransactionId, body)

			expect(response.status).toBe(400)
			expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', retryable: false })
			expect((await read(pending.providerTransactionId)).body).toEqual(pending)
			expect(await eventsOf(pending.providerTransactionId)).toHaveLength(1)
		})

		// AC-4: catches a replay returning a stale or stored copy instead of the current state.
		it('is reflected by an idempotent replay of the original creation', async () => {
			const key = randomUUID()
			const pending = await deferred(key)
			const advanced = await advance(pending.providerTransactionId, { status: 'SUCCEEDED' })

			const replay = await create('PAY-1', key)

			expect(replay.status).toBe(200)
			expect(replay.headers['idempotent-replayed']).toBe('true')
			expect(replay.body).toEqual(advanced.body)
		})
	})

	describe('a decided transaction (AC-25)', () => {
		// AC-25: catches a terminal status being rewritten or a second terminal event appended.
		it.each([
			['SUCCEEDED', { status: 'SUCCEEDED' }, { status: 'FAILED', failureCode: 'ACCOUNT_BLOCKED' }],
			['SUCCEEDED', { status: 'SUCCEEDED' }, { status: 'SUCCEEDED' }],
			['FAILED', { status: 'FAILED', failureCode: 'ACCOUNT_BLOCKED' }, { status: 'SUCCEEDED' }],
		])(
			'answers 409 INVALID_TRANSITION when already %s and leaves it unchanged',
			async (_status, first, second) => {
				const pending = await deferred()
				const decided = await advance(pending.providerTransactionId, first).expect(200)

				const response = await advance(pending.providerTransactionId, second)

				expect(response.status).toBe(409)
				expect(response.body).toMatchObject({ code: 'INVALID_TRANSITION', retryable: false })
				expect((await read(pending.providerTransactionId)).body).toEqual(decided.body)
				expect(await eventsOf(pending.providerTransactionId)).toHaveLength(2)
			},
		)

		// AC-25: catches an immediately succeeded transaction being advanced again.
		it('answers 409 for a transaction that succeeded on creation', async () => {
			const created = await create('PAY-2').expect(201)

			const response = await advance(created.body.providerTransactionId, {
				status: 'FAILED',
				failureCode: 'ACCOUNT_BLOCKED',
			})

			expect(response.status).toBe(409)
			expect(response.body.code).toBe('INVALID_TRANSITION')
			expect((await read(created.body.providerTransactionId)).body).toEqual(created.body)
		})
	})

	describe('scoping (AC-25, AC-9)', () => {
		// AC-25: catches one Client deciding another Client's transaction.
		it("answers 404 TRANSACTION_NOT_FOUND for another Client's transaction and leaves it pending", async () => {
			const pending = await deferred()

			const response = await advance(
				pending.providerTransactionId,
				{ status: 'SUCCEEDED' },
				TEST_CLIENTS.other,
			)

			expect(response.status).toBe(404)
			expect(response.body).toMatchObject({ code: 'TRANSACTION_NOT_FOUND', retryable: false })
			expect((await read(pending.providerTransactionId)).body).toEqual(pending)
			expect(await eventsOf(pending.providerTransactionId)).toHaveLength(1)
		})

		it('answers 404 TRANSACTION_NOT_FOUND for an unknown id', async () => {
			const response = await advance(`FBK-${randomUUID()}`, { status: 'SUCCEEDED' })

			expect(response.status).toBe(404)
			expect(response.body.code).toBe('TRANSACTION_NOT_FOUND')
		})

		// AC-9: catches the lab decision being reachable without a valid API key.
		it.each<[string, string | undefined]>([
			['no Authorization header', undefined],
			['an unknown key', 'Bearer test-key-nobody'],
			['a malformed Authorization header', `Basic ${TEST_CLIENTS.paylab.apiKey}`],
		])('answers 401 UNAUTHORIZED with %s and leaves it pending', async (_case, authorization) => {
			const pending = await deferred()
			const call = request(app.getHttpServer()).post(
				`/__test/transactions/${pending.providerTransactionId}/advance`,
			)
			if (authorization !== undefined) call.set('Authorization', authorization)

			const response = await call.send({ status: 'SUCCEEDED' })

			expect(response.status).toBe(401)
			expect(response.body.code).toBe('UNAUTHORIZED')
			expect((await read(pending.providerTransactionId)).body).toEqual(pending)
		})
	})
})
