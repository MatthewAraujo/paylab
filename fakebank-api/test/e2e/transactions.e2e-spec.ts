import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { TEST_CLIENTS, bearer, sha256Hex } from '../support/clients'
import { prisma } from '../support/database'

const FBK_UUID_V7 = /^FBK-[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

const validBody = { externalReference: 'payment-123', amountMinor: 1500, currency: 'BRL' }

describe('Provider Transactions: create and read', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	function create(
		body: unknown = validBody,
		client: { apiKey: string } = TEST_CLIENTS.paylab,
		idempotencyKey: string = randomUUID(),
	) {
		return request(app.getHttpServer())
			.post('/v1/transactions')
			.set('Authorization', bearer(client))
			.set('Idempotency-Key', idempotencyKey)
			.send(body as object)
	}

	// AC-1: catches a wrong status code or status, a missing FBK- id, or a float/string Amount.
	it('creates an immediately succeeded Provider Transaction with 201', async () => {
		const response = await create()

		expect(response.status).toBe(201)
		expect(response.body).toEqual({
			providerTransactionId: expect.stringMatching(FBK_UUID_V7),
			externalReference: 'payment-123',
			status: 'SUCCEEDED',
			amountMinor: 1500,
			currency: 'BRL',
			failureCode: null,
			createdAt: expect.stringMatching(ISO_TIMESTAMP),
			updatedAt: expect.stringMatching(ISO_TIMESTAMP),
			completedAt: expect.stringMatching(ISO_TIMESTAMP),
		})
	})

	// AC-27: catches events missing, duplicated, out of order or written outside the transaction.
	it('records transaction.processing then transaction.succeeded for an immediate success', async () => {
		const response = await create()
		const id = response.body.providerTransactionId

		const events = await prisma.providerTransactionEvent.findMany({
			where: { providerTransactionId: id },
			orderBy: { sequence: 'asc' },
		})

		expect(events.map(({ type, status, failureCode }) => ({ type, status, failureCode }))).toEqual([
			{ type: 'transaction.processing', status: 'PROCESSING', failureCode: null },
			{ type: 'transaction.succeeded', status: 'SUCCEEDED', failureCode: null },
		])
		expect(events[1].occurredAt.toISOString()).toBe(response.body.completedAt)
	})

	async function persistedCounts() {
		return {
			transactions: await prisma.providerTransaction.count(),
			events: await prisma.providerTransactionEvent.count(),
		}
	}

	describe('authentication (AC-9, AC-34)', () => {
		const badAuthorizations: [string, string | undefined][] = [
			['no Authorization header', undefined],
			['a non-Bearer scheme', `Basic ${TEST_CLIENTS.paylab.apiKey}`],
			['an empty Bearer token', 'Bearer '],
			['an unknown key', 'Bearer test-key-nobody'],
			// The configured value is the hash; sending it as the key must not authenticate.
			['the configured hash instead of the key', `Bearer ${sha256Hex(TEST_CLIENTS.paylab.apiKey)}`],
		]

		// Catches unauthenticated creation (and a partial write before the check).
		it.each(badAuthorizations)('refuses creation with %s', async (_case, authorization) => {
			const call = request(app.getHttpServer())
				.post('/v1/transactions')
				.set('Idempotency-Key', randomUUID())
			if (authorization !== undefined) call.set('Authorization', authorization)

			const response = await call.send(validBody)

			expect(response.status).toBe(401)
			expect(response.body).toEqual({
				code: 'UNAUTHORIZED',
				message: expect.any(String),
				retryable: false,
				requestId: response.headers['x-request-id'],
			})
			expect(await persistedCounts()).toEqual({ transactions: 0, events: 0 })
		})

		// Catches unauthenticated reads.
		it.each(badAuthorizations)('refuses reads with %s', async (_case, authorization) => {
			const { body } = await create()
			const call = request(app.getHttpServer()).get(
				`/v1/transactions/${body.providerTransactionId}`,
			)
			if (authorization !== undefined) call.set('Authorization', authorization)

			const response = await call

			expect(response.status).toBe(401)
			expect(response.body.code).toBe('UNAUTHORIZED')
		})

		// AC-34: the second configured Client authenticates with its own key, as itself.
		it('authenticates every configured Client by the hash of its key', async () => {
			const response = await create(validBody, TEST_CLIENTS.other)

			expect(response.status).toBe(201)
			const row = await prisma.providerTransaction.findUniqueOrThrow({
				where: { id: response.body.providerTransactionId },
			})
			expect(row.clientId).toBe('other-client')
		})
	})

	describe('validation (AC-3)', () => {
		// Catches invalid money or references accepted, and partial writes on refusal.
		it.each([
			['a missing externalReference', { amountMinor: 1500, currency: 'BRL' }],
			['a missing amountMinor', { externalReference: 'payment-123', currency: 'BRL' }],
			['a missing currency', { externalReference: 'payment-123', amountMinor: 1500 }],
			['amountMinor 0', { ...validBody, amountMinor: 0 }],
			['a negative amountMinor', { ...validBody, amountMinor: -1 }],
			['a decimal amountMinor', { ...validBody, amountMinor: 10.5 }],
			['a string amountMinor', { ...validBody, amountMinor: '1500' }],
			['an unsafe integer amountMinor', { ...validBody, amountMinor: 2 ** 53 }],
			['an empty externalReference', { ...validBody, externalReference: '' }],
			['a blank externalReference', { ...validBody, externalReference: '   ' }],
			['an externalReference over 128 chars', { ...validBody, externalReference: 'x'.repeat(129) }],
			['a malformed currency', { ...validBody, currency: 'reais' }],
		])('answers 400 VALIDATION_ERROR for %s and persists nothing', async (_case, body) => {
			const response = await create(body)

			expect(response.status).toBe(400)
			expect(response.body.code).toBe('VALIDATION_ERROR')
			expect(await persistedCounts()).toEqual({ transactions: 0, events: 0 })
		})

		it('accepts an externalReference of exactly 128 chars', async () => {
			const response = await create({ ...validBody, externalReference: 'x'.repeat(128) })

			expect(response.status).toBe(201)
		})

		// AC-2/AC-3: catches a missing, empty or oversized Idempotency-Key being accepted.
		it.each([
			['a missing', undefined],
			['an empty', ''],
			['an oversized', 'k'.repeat(256)],
		])('answers 400 VALIDATION_ERROR for %s Idempotency-Key (AC-2)', async (_case, key) => {
			const call = request(app.getHttpServer())
				.post('/v1/transactions')
				.set('Authorization', bearer(TEST_CLIENTS.paylab))
			if (key !== undefined) call.set('Idempotency-Key', key)

			const response = await call.send(validBody)

			expect(response.status).toBe(400)
			expect(response.body.code).toBe('VALIDATION_ERROR')
			expect(response.body.message).toContain('Idempotency-Key')
			expect(await persistedCounts()).toEqual({ transactions: 0, events: 0 })
		})

		// Catches non-BRL currencies accepted.
		it('answers 422 UNSUPPORTED_CURRENCY for USD and persists nothing', async () => {
			const response = await create({ ...validBody, currency: 'USD' })

			expect(response.status).toBe(422)
			expect(response.body).toMatchObject({ code: 'UNSUPPORTED_CURRENCY', retryable: false })
			expect(await persistedCounts()).toEqual({ transactions: 0, events: 0 })
		})
	})

	describe('read by id (AC-7)', () => {
		function read(id: string, client: { apiKey: string } = TEST_CLIENTS.paylab) {
			return request(app.getHttpServer())
				.get(`/v1/transactions/${encodeURIComponent(id)}`)
				.set('Authorization', bearer(client))
		}

		// Catches the read model drifting from the write response.
		it('returns the same representation as the creation response', async () => {
			const created = await create()

			const response = await read(created.body.providerTransactionId)

			expect(response.status).toBe(200)
			expect(response.body).toEqual(created.body)
		})

		// Catches cross-Client data leaks and unknown ids answered as anything but 404.
		it.each([
			['an unknown id', async () => 'FBK-01929b2e-6f3a-7c1d-9a4f-3f1e2d6c9b7a'],
			['a malformed id', async () => 'not-a-fakebank-id'],
			[
				"another Client's id",
				async () => (await create(validBody, TEST_CLIENTS.other)).body.providerTransactionId,
			],
		])('answers 404 TRANSACTION_NOT_FOUND for %s', async (_case, idOf) => {
			const response = await read(await idOf())

			expect(response.status).toBe(404)
			expect(response.body).toMatchObject({ code: 'TRANSACTION_NOT_FOUND', retryable: false })
		})
	})
})
