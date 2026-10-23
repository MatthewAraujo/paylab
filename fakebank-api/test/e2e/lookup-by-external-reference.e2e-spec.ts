import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'
import { TEST_CLIENTS, bearer } from '../support/clients'

describe('Provider Transactions: lookup by External Reference (AC-8)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	function create(
		externalReference: string,
		client: { apiKey: string } = TEST_CLIENTS.paylab,
		amountMinor = 1500,
	) {
		return request(app.getHttpServer())
			.post('/v1/transactions')
			.set('Authorization', bearer(client))
			.set('Idempotency-Key', randomUUID())
			.send({ externalReference, amountMinor, currency: 'BRL' })
	}

	function list(query: string, client: { apiKey: string } = TEST_CLIENTS.paylab) {
		return request(app.getHttpServer())
			.get(`/v1/transactions${query}`)
			.set('Authorization', bearer(client))
	}

	// Catches the list representation drifting from the creation/by-id one.
	it('returns the matching Provider Transaction in the standard representation', async () => {
		const created = await create('PAY-1')

		const response = await list('?externalReference=PAY-1')

		expect(response.status).toBe(200)
		expect(response.body).toEqual({ data: [created.body] })
	})

	// Catches silent deduplication hiding a double submission, and an unstable or newest-first order.
	it('returns every transaction carrying the reference, oldest first, across Idempotency Keys', async () => {
		const first = await create('PAY-1', TEST_CLIENTS.paylab, 1000)
		const second = await create('PAY-1', TEST_CLIENTS.paylab, 2000)
		await create('PAY-2')

		const response = await list('?externalReference=PAY-1')

		expect(response.status).toBe(200)
		expect(response.body.data.map((t: { amountMinor: number }) => t.amountMinor)).toEqual([
			1000, 2000,
		])
		expect(
			response.body.data.map((t: { providerTransactionId: string }) => t.providerTransactionId),
		).toEqual([first.body.providerTransactionId, second.body.providerTransactionId])
	})

	// Catches a 404 where recovery code expects an empty list.
	it('answers 200 with an empty list for an unknown reference', async () => {
		const response = await list('?externalReference=PAY-unknown')

		expect(response.status).toBe(200)
		expect(response.body).toEqual({ data: [] })
	})

	// Catches a cross-Client leak: References are only meaningful within one Client.
	it("never includes another Client's transactions with the same reference", async () => {
		await create('PAY-1', TEST_CLIENTS.other)
		const own = await create('PAY-1')

		const response = await list('?externalReference=PAY-1')
		const otherView = await list('?externalReference=PAY-1', TEST_CLIENTS.other)

		expect(response.body).toEqual({ data: [own.body] })
		expect(otherView.body.data).toHaveLength(1)
		expect(otherView.body.data[0].providerTransactionId).not.toBe(own.body.providerTransactionId)
	})

	// Catches a missing filter listing every transaction of the Client, or a crash on an array.
	it.each([
		['missing', ''],
		['empty', '?externalReference='],
		['blank', '?externalReference=%20%20'],
		['longer than 128 chars', `?externalReference=${'x'.repeat(129)}`],
		['repeated', '?externalReference=PAY-1&externalReference=PAY-2'],
	])('answers 400 VALIDATION_ERROR when externalReference is %s', async (_case, query) => {
		await create('PAY-1')

		const response = await list(query)

		expect(response.status).toBe(400)
		expect(response.body).toMatchObject({ code: 'VALIDATION_ERROR', retryable: false })
		expect(response.body.message).toContain('externalReference')
	})

	// AC-9: catches an unauthenticated listing, or one that accepts any Bearer-looking header.
	it.each<[string, string | undefined]>([
		['no Authorization header', undefined],
		['an unknown key', 'Bearer test-key-nobody'],
		['a malformed Authorization header', `Basic ${TEST_CLIENTS.paylab.apiKey}`],
	])('answers 401 UNAUTHORIZED with %s', async (_case, authorization) => {
		await create('PAY-1')
		const call = request(app.getHttpServer()).get('/v1/transactions?externalReference=PAY-1')
		if (authorization !== undefined) call.set('Authorization', authorization)

		const response = await call

		expect(response.status).toBe(401)
		expect(response.body).toMatchObject({ code: 'UNAUTHORIZED' })
	})
})
