import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { buildListeningApp, inParallel } from '../support/concurrency'
import { prisma } from '../support/database'

// AC-25: two decisions on one PROCESSING Provider Transaction under real parallel HTTP requests.
// The state machine alone cannot arbitrate (every request reads PROCESSING); the status-guarded
// update must, so a check-then-update race shows up here as several 200s or terminal events.

const PARALLEL = 10

let app: INestApplication

beforeAll(async () => {
	app = await buildListeningApp()
})

afterAll(async () => {
	await app?.close()
})

async function deferredTransactionId(): Promise<string> {
	await request(app.getHttpServer())
		.post('/__test/scenarios')
		.set('Authorization', bearer(TEST_CLIENTS.paylab))
		.send({ externalReference: 'PAY-1', outcome: 'DEFERRED' })
		.expect(201)
	const created = await request(app.getHttpServer())
		.post('/v1/transactions')
		.set('Authorization', bearer(TEST_CLIENTS.paylab))
		.set('Idempotency-Key', randomUUID())
		.send({ externalReference: 'PAY-1', amountMinor: 1500, currency: 'BRL' })
		.expect(202)
	return created.body.providerTransactionId
}

// Catches a double decision: two winners, or a row whose status disagrees with its events.
it('lets exactly one of several parallel advances decide a PROCESSING transaction', async () => {
	const id = await deferredTransactionId()

	const responses = await inParallel(PARALLEL, (index) =>
		request(app.getHttpServer())
			.post(`/__test/transactions/${id}/advance`)
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.send(
				index % 2 === 0
					? { status: 'SUCCEEDED' }
					: { status: 'FAILED', failureCode: 'ACCOUNT_BLOCKED' },
			),
	)

	const winners = responses.filter((response) => response.status === 200)
	const losers = responses.filter((response) => response.status === 409)
	expect(winners).toHaveLength(1)
	expect(losers).toHaveLength(PARALLEL - 1)
	expect(new Set(losers.map((response) => response.body.code))).toEqual(
		new Set(['INVALID_TRANSITION']),
	)
	const row = await prisma.providerTransaction.findUniqueOrThrow({ where: { id } })
	expect(row.status).toBe(winners[0].body.status)
	const events = await prisma.providerTransactionEvent.findMany({
		where: { providerTransactionId: id },
		orderBy: { sequence: 'asc' },
	})
	expect(events.map((event) => event.status)).toEqual(['PROCESSING', winners[0].body.status])
})
