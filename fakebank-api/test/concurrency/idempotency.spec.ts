import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { buildListeningApp, inParallel } from '../support/concurrency'
import { prisma } from '../support/database'

// AC-31: idempotency under real parallel HTTP requests; the unique (client, key) index must be
// the arbiter, so a check-then-insert race would show up here as duplicates or 500s.

const PARALLEL = 20

const validBody = { externalReference: 'payment-123', amountMinor: 1500, currency: 'BRL' }

let app: INestApplication

beforeAll(async () => {
	app = await buildListeningApp()
})

afterAll(async () => {
	await app?.close()
})

function create(idempotencyKey: string, body: object) {
	return request(app.getHttpServer())
		.post('/v1/transactions')
		.set('Authorization', bearer(TEST_CLIENTS.paylab))
		.set('Idempotency-Key', idempotencyKey)
		.send(body)
}

function countBy(values: number[]): Record<number, number> {
	const counts: Record<number, number> = {}
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

// Catches a check-then-insert race creating duplicates, or a losing insert surfacing as a 500.
it('creates exactly one Provider Transaction for parallel identical requests', async () => {
	const key = randomUUID()

	const responses = await inParallel(PARALLEL, () => create(key, validBody))

	expect(countBy(responses.map((response) => response.status))).toEqual({
		201: 1,
		200: PARALLEL - 1,
	})
	const ids = new Set(responses.map((response) => response.body.providerTransactionId))
	expect(ids.size).toBe(1)
	expect(await prisma.providerTransaction.count()).toBe(1)
	expect(await prisma.providerTransactionEvent.count()).toBe(2)
})

// Catches a conflicting body winning the race unnoticed (replayed or stored as a second row).
it('answers 409 to every parallel request whose body differs from the winner', async () => {
	const key = randomUUID()

	const responses = await inParallel(PARALLEL, (index) =>
		create(key, { ...validBody, amountMinor: 1500 + index }),
	)

	expect(countBy(responses.map((response) => response.status))).toEqual({
		201: 1,
		409: PARALLEL - 1,
	})
	const conflicts = responses.filter((response) => response.status === 409)
	expect(new Set(conflicts.map((response) => response.body.code))).toEqual(
		new Set(['IDEMPOTENCY_KEY_REUSED']),
	)
	const winner = responses.find((response) => response.status === 201)
	const rows = await prisma.providerTransaction.findMany()
	expect(rows).toHaveLength(1)
	expect(rows[0].id).toBe(winner?.body.providerTransactionId)
	expect(Number(rows[0].amountMinor)).toBe(winner?.body.amountMinor)
	expect(await prisma.providerTransactionEvent.count()).toBe(2)
})
