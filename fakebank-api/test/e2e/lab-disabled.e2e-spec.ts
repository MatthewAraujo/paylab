import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { TEST_CLIENTS, bearer } from '../support/clients'
import { bootWithEnv } from '../support/fresh-app'

const LAB_ROUTES = ['/__test/scenarios', '/__test/transactions/FBK-any/advance']

// AC-29/AC-12: the lab surface is scenario injection; it must not exist unless explicitly enabled.
// AC-30 (no boot in production with the flag on) is covered where the validation lives
// (test/infra/env.spec.ts): @nestjs/config validates while AppModule is being imported, so a
// refused boot here surfaces as an unhandled rejection rather than a catchable error.
describe('lab surface switch', () => {
	let app: INestApplication | undefined

	afterEach(async () => {
		await app?.close()
		app = undefined
	})

	// AC-29: catches the lab being exposed by default or with an explicit false.
	it.each([
		['unset', undefined],
		['false', 'false'],
	])('answers every lab endpoint 404 with the flag %s', async (_case, flag) => {
		app = await bootWithEnv({ FAKEBANK_LAB_ENABLED: flag })

		for (const route of LAB_ROUTES) {
			const response = await request(app.getHttpServer())
				.post(route)
				.set('Authorization', bearer(TEST_CLIENTS.paylab))
				.send({ externalReference: 'PAY-1', outcome: 'FAIL', failureCode: 'INSUFFICIENT_FUNDS' })

			expect(response.status, route).toBe(404)
			expect(response.body, route).toMatchObject({ code: 'NOT_FOUND', retryable: false })
		}
	})

	// AC-12: catches lab routes leaking into the public contract when the lab is off.
	it('leaves the lab routes out of the OpenAPI document when off', async () => {
		app = await bootWithEnv({ FAKEBANK_LAB_ENABLED: 'false' })

		const { body } = await request(app.getHttpServer()).get('/docs-json')

		expect(body.paths).toHaveProperty(['/v1/transactions'])
		expect(Object.keys(body.paths).filter((path) => path.startsWith('/__test'))).toEqual([])
	})

	// AC-29: catches scenarios left in the database still injecting Outcomes once the lab is off.
	// Covers both consumption points: inside the insert (FAIL) and before persistence (RATE_LIMIT).
	it.each([{ outcome: 'FAIL', failureCode: 'INSUFFICIENT_FUNDS' }, { outcome: 'RATE_LIMIT' }])(
		'ignores a registered $outcome scenario when off',
		async (scenario) => {
			const lab = await bootWithEnv({ FAKEBANK_LAB_ENABLED: 'true' })
			await request(lab.getHttpServer())
				.post('/__test/scenarios')
				.set('Authorization', bearer(TEST_CLIENTS.paylab))
				.send({ externalReference: 'PAY-1', ...scenario })
				.expect(201)
			await lab.close()
			app = await bootWithEnv({ FAKEBANK_LAB_ENABLED: 'false' })

			const response = await request(app.getHttpServer())
				.post('/v1/transactions')
				.set('Authorization', bearer(TEST_CLIENTS.paylab))
				.set('Idempotency-Key', 'key-1')
				.send({ externalReference: 'PAY-1', amountMinor: 1500, currency: 'BRL' })

			expect([response.status, response.body.status]).toEqual([201, 'SUCCEEDED'])
		},
	)
})
