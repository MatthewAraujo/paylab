import { randomUUID } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { prisma } from '../support/database'

// The test layers run with FAKEBANK_LAB_ENABLED=true (setup-env.ts).
describe('Transport Outcomes and delay', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
		// Already listening: supertest would otherwise close its per-request server under a
		// timed-out request still being served (AC-19).
		await app.listen(0)
	})

	afterAll(async () => {
		await app.close()
	})

	function register(body: object) {
		return request(app.getHttpServer())
			.post('/__test/scenarios')
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.send(body)
			.expect(201)
	}

	function attempt(externalReference: string, idempotencyKey: string = randomUUID()) {
		return request(app.getHttpServer())
			.post('/v1/transactions')
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.set('Idempotency-Key', idempotencyKey)
			.send({ externalReference, amountMinor: 1500, currency: 'BRL' })
	}

	function lookup(externalReference: string) {
		return request(app.getHttpServer())
			.get('/v1/transactions')
			.query({ externalReference })
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.expect(200)
	}

	async function eventStatuses(providerTransactionId: string) {
		const events = await prisma.providerTransactionEvent.findMany({
			where: { providerTransactionId },
			orderBy: { sequence: 'asc' },
		})
		return events.map((event) => event.status)
	}

	async function remainingAttempts(externalReference: string) {
		const scenario = await prisma.simulationScenario.findFirstOrThrow({
			where: { externalReference },
		})
		return scenario.remainingAttempts
	}

	/** Polls the lookup until the External Reference has a transaction (at most 1 s). */
	async function waitForTransaction(externalReference: string) {
		for (let tries = 0; tries < 20; tries++) {
			const [row] = (await lookup(externalReference)).body.data
			if (row) return row
			await sleep(50)
		}
		throw new Error(`No transaction for ${externalReference}`)
	}

	async function expectNothingPersisted() {
		expect(await prisma.providerTransaction.count()).toBe(0)
		expect(await prisma.providerTransactionEvent.count()).toBe(0)
	}

	describe('RATE_LIMIT (AC-16, AC-20)', () => {
		// AC-16: catches a rate limit that leaves partial state or omits the backoff hint.
		it('answers 429 PROVIDER_RATE_LIMIT with Retry-After 1 and persists nothing', async () => {
			await register({ externalReference: 'PAY-RL', outcome: 'RATE_LIMIT' })

			const response = await attempt('PAY-RL')

			expect(response.status).toBe(429)
			expect(response.headers['retry-after']).toBe('1')
			expect(response.body).toMatchObject({ code: 'PROVIDER_RATE_LIMIT', retryable: true })
			await expectNothingPersisted()
		})

		// AC-16: catches retryAfterSeconds being ignored.
		it('uses retryAfterSeconds for Retry-After', async () => {
			await register({ externalReference: 'PAY-RL', outcome: 'RATE_LIMIT', retryAfterSeconds: 30 })

			const response = await attempt('PAY-RL')

			expect(response.status).toBe(429)
			expect(response.headers['retry-after']).toBe('30')
		})

		// AC-20: catches a retry blocked forever, or the key burned by the failed attempt.
		it('applies times: 1 once; the retry with the same key creates the transaction', async () => {
			await register({ externalReference: 'PAY-RL', outcome: 'RATE_LIMIT', times: 1 })
			const key = randomUUID()

			expect((await attempt('PAY-RL', key)).status).toBe(429)
			const retry = await attempt('PAY-RL', key)

			expect(retry.status).toBe(201)
			expect(retry.body.status).toBe('SUCCEEDED')
			expect(await prisma.providerTransaction.count()).toBe(1)
		})
	})

	describe('ERROR_BEFORE_COMMIT (AC-17)', () => {
		// AC-17: catches a pre-commit failure that persists work, making the retry unsafe.
		it('answers 503 PROVIDER_UNAVAILABLE and persists nothing; the retry creates exactly one', async () => {
			await register({ externalReference: 'PAY-BC', outcome: 'ERROR_BEFORE_COMMIT' })
			const key = randomUUID()

			const response = await attempt('PAY-BC', key)

			expect(response.status).toBe(503)
			expect(response.body).toMatchObject({ code: 'PROVIDER_UNAVAILABLE', retryable: true })
			expect(response.headers['retry-after']).toBeUndefined()
			await expectNothingPersisted()

			const retry = await attempt('PAY-BC', key)
			expect(retry.status).toBe(201)
			expect((await lookup('PAY-BC')).body.data).toHaveLength(1)
		})
	})

	describe('ERROR_AFTER_COMMIT (AC-18)', () => {
		// AC-18: catches the error response rolling back the work, or leaving no record of it.
		it('persists a SUCCEEDED transaction with both events and answers 500 PROVIDER_INTERNAL_ERROR', async () => {
			await register({ externalReference: 'PAY-AC', outcome: 'ERROR_AFTER_COMMIT' })

			const response = await attempt('PAY-AC')

			expect(response.status).toBe(500)
			expect(response.body).toMatchObject({ code: 'PROVIDER_INTERNAL_ERROR', retryable: true })
			const [persisted] = (await lookup('PAY-AC')).body.data
			expect(persisted.status).toBe('SUCCEEDED')
			expect(await eventStatuses(persisted.providerTransactionId)).toEqual([
				'PROCESSING',
				'SUCCEEDED',
			])
		})

		// AC-18: catches an ambiguous failure turning into a double charge on retry.
		it('the retry with the same key replays that transaction with 200 and no second row', async () => {
			await register({ externalReference: 'PAY-AC', outcome: 'ERROR_AFTER_COMMIT' })
			const key = randomUUID()
			expect((await attempt('PAY-AC', key)).status).toBe(500)

			const retry = await attempt('PAY-AC', key)

			expect(retry.status).toBe(200)
			expect(retry.headers['idempotent-replayed']).toBe('true')
			const rows = (await lookup('PAY-AC')).body.data
			expect(rows).toHaveLength(1)
			expect(retry.body).toEqual(rows[0])
		})
	})

	describe('delay after persistence (AC-19)', () => {
		// AC-19: catches a delay applied before persistence, lost work, or a duplicate on retry.
		it('a client that times out leaves exactly one transaction, replayed by the retry', async () => {
			await register({ externalReference: 'PAY-DL', outcome: 'SUCCEED', delayMs: 1500 })
			const key = randomUUID()
			const startedAt = Date.now()

			await expect(attempt('PAY-DL', key).timeout(300)).rejects.toThrow(/timeout/i)

			const duringDelay = (await lookup('PAY-DL')).body.data
			expect(duringDelay).toHaveLength(1)
			expect(duringDelay[0].status).toBe('SUCCEEDED')

			await sleep(1500 - (Date.now() - startedAt) + 300)
			const retry = await attempt('PAY-DL', key)
			expect(retry.status).toBe(200)
			expect(retry.body.providerTransactionId).toBe(duringDelay[0].providerTransactionId)
			expect((await lookup('PAY-DL')).body.data).toHaveLength(1)
		})

		// AC-19: catches the delay applied to the wrong phase (before the decision is persisted).
		it('persists a delayed FAIL before answering it', async () => {
			await register({
				externalReference: 'PAY-DF',
				outcome: 'FAIL',
				failureCode: 'INSUFFICIENT_FUNDS',
				delayMs: 1000,
			})
			const startedAt = Date.now()
			let answered = false
			const pending = attempt('PAY-DF').then((response) => {
				answered = true
				return response
			})

			const persisted = await waitForTransaction('PAY-DF')
			expect(answered).toBe(false)
			expect(persisted).toMatchObject({ status: 'FAILED', failureCode: 'INSUFFICIENT_FUNDS' })

			const response = await pending
			expect(response.status).toBe(201)
			expect(response.body.status).toBe('FAILED')
			expect(Date.now() - startedAt).toBeGreaterThanOrEqual(1000)
		})
	})

	// AC-20: catches a transport Outcome that never runs out, or is applied past `times`.
	it.each([
		['RATE_LIMIT', 429],
		['ERROR_BEFORE_COMMIT', 503],
		['ERROR_AFTER_COMMIT', 500],
	])(
		'%s with times: 2 shapes exactly two attempts, then succeeds immediately',
		async (outcome, status) => {
			await register({ externalReference: 'PAY-N', outcome, times: 2 })

			const statuses: number[] = []
			for (let index = 0; index < 3; index++) {
				statuses.push((await attempt('PAY-N')).status)
			}

			expect(statuses).toEqual([status, status, 201])
		},
	)

	describe('replay of a persisted key (AC-21)', () => {
		// AC-21: catches a pre-persistence Outcome bypassed by the idempotency step.
		it('applies and consumes a pre-persistence Outcome; the next replay answers 200', async () => {
			const key = randomUUID()
			const created = await attempt('PAY-RP', key)
			expect(created.status).toBe(201)
			await register({ externalReference: 'PAY-RP', outcome: 'RATE_LIMIT', times: 1 })

			const limited = await attempt('PAY-RP', key)
			expect(limited.status).toBe(429)
			expect(await remainingAttempts('PAY-RP')).toBe(0)

			const replay = await attempt('PAY-RP', key)
			expect(replay.status).toBe(200)
			expect(replay.body.providerTransactionId).toBe(created.body.providerTransactionId)
			expect(await prisma.providerTransaction.count()).toBe(1)
		})

		// AC-21: catches a replay that consumes, is delayed by, or applies a post-persistence Outcome.
		it.each([
			{ outcome: 'FAIL', failureCode: 'INSUFFICIENT_FUNDS', delayMs: 2000 },
			{ outcome: 'SUCCEED', delayMs: 2000 },
			{ outcome: 'ERROR_AFTER_COMMIT', delayMs: 2000 },
			{ outcome: 'DEFERRED', delayMs: 2000 },
		])('a $outcome scenario neither applies to nor delays the replay', async (scenario) => {
			const key = randomUUID()
			const created = await attempt('PAY-RP', key)
			expect(created.status).toBe(201)
			await register({ externalReference: 'PAY-RP', times: 2, ...scenario })

			const startedAt = Date.now()
			const replay = await attempt('PAY-RP', key)

			expect(replay.status).toBe(200)
			expect(replay.body).toEqual(created.body)
			expect(Date.now() - startedAt).toBeLessThan(1000)
			expect(await remainingAttempts('PAY-RP')).toBe(2)
		})
	})
})
