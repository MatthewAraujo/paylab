import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'

// AC-12: the OpenAPI documentation is served and describes the error shape; catches Swagger
// not being mounted or the envelope missing from the document.
describe('OpenAPI documentation', () => {
	let app: INestApplication

	beforeAll(async () => {
		app = await buildTestApp()
	})

	afterAll(async () => {
		await app.close()
	})

	it('serves the Swagger UI at /docs', async () => {
		const response = await request(app.getHttpServer()).get('/docs')

		expect(response.status).toBe(200)
		expect(response.headers['content-type']).toContain('text/html')
	})

	it('serves the JSON document with the health route and the error envelope schema', async () => {
		const response = await request(app.getHttpServer()).get('/docs-json')

		expect(response.status).toBe(200)
		expect(response.body.openapi).toMatch(/^3\./)
		expect(response.body.paths).toHaveProperty('/health')
		expect(response.body.components.schemas.ErrorEnvelopeResponse.required).toEqual(
			expect.arrayContaining(['code', 'message', 'retryable', 'requestId']),
		)
	})
})
