import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { prisma } from '../support/database'

type Client = { apiKey: string }

// The test layers run with FAKEBANK_LAB_ENABLED=true (setup-env.ts).
describe('Simulation Scenarios', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	function register(body: object, client: Client = TEST_CLIENTS.paylab) {
		return request(app.getHttpServer())
			.post('/__test/scenarios')
			.set('Authorization', bearer(client))
			.send(body)
	}

	function attempt(
		externalReference: string,
		client: Client = TEST_CLIENTS.paylab,
		idempotencyKey: string = randomUUID(),
	) {
		return request(app.getHttpServer())
			.post('/v1/transactions')
			.set('Authorization', bearer(client))
			.set('Idempotency-Key', idempotencyKey)
			.send({ externalReference, amountMinor: 1500, currency: 'BRL' })
	}

	async function eventsOf(providerTransactionId: string) {
		const events = await prisma.providerTransactionEvent.findMany({
			where: { providerTransactionId },
			orderBy: { sequence: 'asc' },
		})
		return events.map(({ type, status, failureCode }) => ({ type, status, failureCode }))
	}

	describe('registration (AC-13)', () => {
		// AC-13: catches a registration silently ignored or echoed with the wrong defaults.
		it('answers 201 echoing the scenario with its defaults', async () => {
			const response = await register({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				failureCode: 'INSUFFICIENT_FUNDS',
			})

			expect(response.status).toBe(201)
			expect(response.body).toEqual({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				delayMs: 0,
				failureCode: 'INSUFFICIENT_FUNDS',
				retryAfterSeconds: null,
				times: 1,
			})
		})

		it('echoes every optional field when given', async () => {
			const response = await register({
				externalReference: 'PAY-2',
				outcome: 'RATE_LIMIT',
				delayMs: 120000,
				retryAfterSeconds: 3600,
				times: 100,
			})

			expect(response.status).toBe(201)
			expect(response.body).toEqual({
				externalReference: 'PAY-2',
				outcome: 'RATE_LIMIT',
				delayMs: 120000,
				failureCode: null,
				retryAfterSeconds: 3600,
				times: 100,
			})
		})

		// AC-13: catches impossible scenarios being stored.
		it.each([
			['FAIL without failureCode', { outcome: 'FAIL' }],
			['FAIL with a blank failureCode', { outcome: 'FAIL', failureCode: '  ' }],
			['failureCode on SUCCEED', { outcome: 'SUCCEED', failureCode: 'INSUFFICIENT_FUNDS' }],
			['failureCode on DEFERRED', { outcome: 'DEFERRED', failureCode: 'INSUFFICIENT_FUNDS' }],
			[
				'retryAfterSeconds on FAIL',
				{ outcome: 'FAIL', failureCode: 'INSUFFICIENT_FUNDS', retryAfterSeconds: 5 },
			],
			['retryAfterSeconds 0', { outcome: 'RATE_LIMIT', retryAfterSeconds: 0 }],
			['retryAfterSeconds above 3600', { outcome: 'RATE_LIMIT', retryAfterSeconds: 3601 }],
			['times 0', { outcome: 'SUCCEED', times: 0 }],
			['times above 100', { outcome: 'SUCCEED', times: 101 }],
			['times not an integer', { outcome: 'SUCCEED', times: 1.5 }],
			['delayMs -1', { outcome: 'SUCCEED', delayMs: -1 }],
			['delayMs above 120000', { outcome: 'SUCCEED', delayMs: 120001 }],
			['an unknown outcome', { outcome: 'EXPLODE' }],
			['a missing outcome', {}],
			['a missing externalReference', { externalReference: undefined, outcome: 'SUCCEED' }],
			['a blank externalReference', { externalReference: '   ', outcome: 'SUCCEED' }],
			[
				'a 129-character externalReference',
				{ externalReference: 'x'.repeat(129), outcome: 'SUCCEED' },
			],
		])('answers 400 VALIDATION_ERROR for %s and stores nothing', async (_case, body) => {
			const response = await register({ externalReference: 'PAY-1', ...body })

			expect(response.status).toBe(400)
			expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', retryable: false })
			expect(await prisma.simulationScenario.count()).toBe(0)
		})

		// AC-9: catches the lab surface being reachable without a Client.
		it('answers 401 without an API key', async () => {
			const response = await request(app.getHttpServer())
				.post('/__test/scenarios')
				.send({ externalReference: 'PAY-1', outcome: 'SUCCEED' })

			expect(response.status).toBe(401)
			expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' })
		})
	})

	describe('Outcomes on creation', () => {
		// AC-14/AC-27: catches a business failure reported as a transport error, a missing Failure
		// Code, or the failure written without its events.
		it('FAIL persists a FAILED Provider Transaction with the Failure Code and answers 201', async () => {
			await register({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				failureCode: 'INSUFFICIENT_FUNDS',
			})

			const response = await attempt('PAY-1')

			expect(response.status).toBe(201)
			expect(response.body).toMatchObject({
				externalReference: 'PAY-1',
				status: 'FAILED',
				failureCode: 'INSUFFICIENT_FUNDS',
				completedAt: expect.any(String),
			})
			expect(response.body.updatedAt).toBe(response.body.completedAt)
			expect(await eventsOf(response.body.providerTransactionId)).toEqual([
				{ type: 'transaction.processing', status: 'PROCESSING', failureCode: null },
				{ type: 'transaction.failed', status: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS' },
			])
			const row = await prisma.providerTransaction.findUniqueOrThrow({
				where: { id: response.body.providerTransactionId },
			})
			expect(row.appliedOutcome).toBe('FAIL')
		})

		// AC-15/AC-27: catches a pending decision treated as decided (status, 201, completedAt, or a
		// terminal event).
		it('DEFERRED persists a PROCESSING Provider Transaction, answers 202 and stays pending', async () => {
			await register({ externalReference: 'PAY-1', outcome: 'DEFERRED' })

			const response = await attempt('PAY-1')

			expect(response.status).toBe(202)
			expect(response.body).toMatchObject({
				status: 'PROCESSING',
				failureCode: null,
				completedAt: null,
			})
			expect(response.body.updatedAt).toBe(response.body.createdAt)
			const read = await request(app.getHttpServer())
				.get(`/v1/transactions/${response.body.providerTransactionId}`)
				.set('Authorization', bearer(TEST_CLIENTS.paylab))
			expect(read.status).toBe(200)
			expect(read.body).toEqual(response.body)
			expect(await eventsOf(response.body.providerTransactionId)).toEqual([
				{ type: 'transaction.processing', status: 'PROCESSING', failureCode: null },
			])
		})

		// AC-20: catches an off-by-one in consumption or a scenario that never expires.
		it('affects exactly the next `times` attempts, then succeeds immediately', async () => {
			await register({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				failureCode: 'INSUFFICIENT_FUNDS',
				times: 2,
			})

			const statuses: [number, string][] = []
			for (let index = 0; index < 4; index++) {
				const response = await attempt('PAY-1')
				statuses.push([response.status, response.body.status])
			}

			expect(statuses).toEqual([
				[201, 'FAILED'],
				[201, 'FAILED'],
				[201, 'SUCCEEDED'],
				[201, 'SUCCEEDED'],
			])
		})

		// AC-13: catches a stale scenario (Outcome or remaining attempts) leaking past a new one.
		it('registering again replaces the Outcome and the remaining attempts', async () => {
			await register({ externalReference: 'PAY-1', outcome: 'DEFERRED', times: 5 })
			expect((await attempt('PAY-1')).status).toBe(202)

			const replaced = await register({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				failureCode: 'CARD_BLOCKED',
			})

			expect(replaced.status).toBe(201)
			expect(replaced.body).toMatchObject({ outcome: 'FAIL', times: 1 })
			expect((await attempt('PAY-1')).body).toMatchObject({
				status: 'FAILED',
				failureCode: 'CARD_BLOCKED',
			})
			expect((await attempt('PAY-1')).body.status).toBe('SUCCEEDED')
		})

		// AC-23: catches one Client's scenario affecting, or being consumed by, another Client.
		it("never applies or consumes another Client's scenario", async () => {
			await register({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				failureCode: 'INSUFFICIENT_FUNDS',
			})

			const other = await attempt('PAY-1', TEST_CLIENTS.other)
			const own = await attempt('PAY-1')

			expect([other.status, other.body.status]).toEqual([201, 'SUCCEEDED'])
			expect([own.status, own.body.status]).toEqual([201, 'FAILED'])
		})

		// AC-1: catches a scenario for one External Reference leaking to another.
		it('leaves other External References on immediate success', async () => {
			await register({ externalReference: 'PAY-1', outcome: 'DEFERRED' })

			const response = await attempt('PAY-2')

			expect([response.status, response.body.status]).toEqual([201, 'SUCCEEDED'])
		})

		// AC-21: catches a replay consuming an attempt or re-applying the Outcome.
		it('does not consume an attempt on an idempotent replay', async () => {
			await register({
				externalReference: 'PAY-1',
				outcome: 'FAIL',
				failureCode: 'INSUFFICIENT_FUNDS',
				times: 2,
			})
			const key = randomUUID()

			const first = await attempt('PAY-1', TEST_CLIENTS.paylab, key)
			const replay = await attempt('PAY-1', TEST_CLIENTS.paylab, key)
			const next = await attempt('PAY-1')

			expect([first.status, first.body.status]).toEqual([201, 'FAILED'])
			expect([replay.status, replay.body.providerTransactionId]).toEqual([
				200,
				first.body.providerTransactionId,
			])
			expect([next.status, next.body.status]).toEqual([201, 'FAILED'])
		})
	})
})
