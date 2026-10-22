import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { buildListeningApp, inParallel } from '../support/concurrency'
import { prisma } from '../support/database'

// AC-22: parallel attempts against one scenario consume its attempts exactly once each; the
// conditional decrement must be the arbiter, so a read-then-write race would show up here as
// more (or fewer) scenario-shaped responses than `times`.

const PARALLEL = 10
const TIMES = 3

let app: INestApplication

beforeAll(async () => {
	app = await buildListeningApp()
})

afterAll(async () => {
	await app?.close()
})

function countBy(values: number[]): Record<number, number> {
	const counts: Record<number, number> = {}
	for (const value of values) counts[value] = (counts[value] ?? 0) + 1
	return counts
}

// Catches attempts shared or lost under parallelism, before persistence (RATE_LIMIT) and inside
// the insert transaction (ERROR_AFTER_COMMIT).
it.each([
	{ outcome: 'RATE_LIMIT', status: 429, persisted: PARALLEL - TIMES },
	{ outcome: 'ERROR_AFTER_COMMIT', status: 500, persisted: PARALLEL },
])(
	'$outcome with times: 3 shapes exactly 3 of 10 parallel attempts',
	async ({ outcome, status, persisted }) => {
		await request(app.getHttpServer())
			.post('/__test/scenarios')
			.set('Authorization', bearer(TEST_CLIENTS.paylab))
			.send({ externalReference: 'PAY-PAR', outcome, times: TIMES })
			.expect(201)

		const responses = await inParallel(PARALLEL, () =>
			request(app.getHttpServer())
				.post('/v1/transactions')
				.set('Authorization', bearer(TEST_CLIENTS.paylab))
				.set('Idempotency-Key', randomUUID())
				.send({ externalReference: 'PAY-PAR', amountMinor: 1500, currency: 'BRL' }),
		)

		expect(countBy(responses.map((response) => response.status))).toEqual({
			[status]: TIMES,
			201: PARALLEL - TIMES,
		})
		expect(await prisma.providerTransaction.count()).toBe(persisted)
		const scenario = await prisma.simulationScenario.findFirstOrThrow({
			where: { externalReference: 'PAY-PAR' },
		})
		expect(scenario.remainingAttempts).toBe(0)
	},
)
