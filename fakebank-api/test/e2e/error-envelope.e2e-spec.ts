import { Controller, Get, INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'

// Test-only route standing in for any unexpected failure deep in a handler.
@Controller('__e2e')
class ExplodingController {
	@Get('boom')
	boom() {
		throw new Error('connection to db-internal-7 refused: secret detail')
	}
}

// AC-10: every error answers { code, message, retryable, requestId } and correlates through
// X-Request-Id; catches framework default bodies leaking instead of the contract.
describe('error envelope and request id', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp({ controllers: [ExplodingController] })
	})

	afterAll(async () => {
		await app.close()
	})

	it('answers an unknown route with a 404 envelope and a generated request id echoed in the header', async () => {
		const response = await request(app.getHttpServer()).get('/v1/does-not-exist')

		expect(response.status).toBe(404)
		expect(Object.keys(response.body).sort()).toEqual(['code', 'message', 'requestId', 'retryable'])
		expect(response.body).toMatchObject({ code: 'NOT_FOUND', retryable: false })
		expect(response.body.requestId).toEqual(expect.any(String))
		expect(response.body.requestId.length).toBeGreaterThan(0)
		expect(response.headers['x-request-id']).toBe(response.body.requestId)
	})

	it('uses the caller X-Request-Id as requestId and echoes it back', async () => {
		const response = await request(app.getHttpServer())
			.get('/v1/does-not-exist')
			.set('X-Request-Id', 'abc')

		expect(response.body.requestId).toBe('abc')
		expect(response.headers['x-request-id']).toBe('abc')
	})

	it('echoes the request id on successful responses too', async () => {
		const response = await request(app.getHttpServer()).get('/health').set('X-Request-Id', 'abc')

		expect(response.headers['x-request-id']).toBe('abc')
	})

	it('turns an unexpected error into a retryable 500 without internal details', async () => {
		const response = await request(app.getHttpServer()).get('/__e2e/boom')

		expect(response.status).toBe(500)
		expect(response.body).toEqual({
			code: 'PROVIDER_INTERNAL_ERROR',
			message: 'An unexpected error occurred.',
			retryable: true,
			requestId: response.headers['x-request-id'],
		})
		expect(response.text).not.toContain('secret detail')
		expect(response.text).not.toContain('at ')
	})
})
