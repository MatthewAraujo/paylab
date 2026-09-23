import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'

describe('Health (E2E)', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app?.close()
	})

	test('[GET] /health', async () => {
		const response = await request(app.getHttpServer()).get('/health')

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			status: 'ok',
			app: 'paylab-api',
			environment: 'test',
		})
	})
})
