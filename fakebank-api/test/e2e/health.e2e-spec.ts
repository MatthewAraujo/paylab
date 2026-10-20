import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'

// AC-11: liveness is public; catches health being registered behind auth or not at all.
describe('GET /health', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	it('answers 200 without an Authorization header', async () => {
		const response = await request(app.getHttpServer()).get('/health')

		expect(response.status).toBe(200)
		expect(response.body).toMatchObject({ status: 'ok' })
	})
})
