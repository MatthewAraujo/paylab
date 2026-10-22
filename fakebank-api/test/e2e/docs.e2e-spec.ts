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

	// AC-12: catches the transaction endpoints missing from the contract, or their error statuses
	// undocumented.
	it('documents the transaction endpoints with their status codes and bearer auth', async () => {
		const { body } = await request(app.getHttpServer()).get('/docs-json')
		const create = body.paths['/v1/transactions'].post
		const read = body.paths['/v1/transactions/{providerTransactionId}'].get

		expect(Object.keys(create.responses).sort()).toEqual([
			'200',
			'201',
			'202',
			'400',
			'401',
			'409',
			'422',
		])
		expect(Object.keys(read.responses).sort()).toEqual(['200', '401', '404'])
		expect(create.responses['400'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ErrorEnvelopeResponse',
		)
		expect(create.parameters).toEqual(
			expect.arrayContaining([expect.objectContaining({ name: 'Idempotency-Key', in: 'header' })]),
		)
		expect(create.security).toEqual([{ bearer: [] }])
		// AC-4/AC-5: the replay header and the key-reuse conflict are part of the contract.
		expect(create.responses['200'].headers).toHaveProperty('Idempotent-Replayed')
		expect(create.responses['409'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ErrorEnvelopeResponse',
		)
		expect(body.components.schemas.ProviderTransactionResponse.required).toEqual(
			expect.arrayContaining(['providerTransactionId', 'status', 'amountMinor', 'completedAt']),
		)
	})

	// AC-8/AC-12: catches the lookup by External Reference missing from the contract, its required
	// query parameter undocumented, or its list shape left untyped.
	it('documents the lookup by External Reference', async () => {
		const { body } = await request(app.getHttpServer()).get('/docs-json')
		const list = body.paths['/v1/transactions'].get

		expect(Object.keys(list.responses).sort()).toEqual(['200', '400', '401'])
		expect(list.parameters).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ name: 'externalReference', in: 'query', required: true }),
			]),
		)
		expect(list.security).toEqual([{ bearer: [] }])
		expect(list.responses['400'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ErrorEnvelopeResponse',
		)
		expect(list.responses['200'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ProviderTransactionListResponse',
		)
		expect(body.components.schemas.ProviderTransactionListResponse.properties.data).toEqual({
			type: 'array',
			items: { $ref: '#/components/schemas/ProviderTransactionResponse' },
		})
	})

	// AC-12/AC-13: with the lab on (the test layers' setting), catches the scenario registration
	// missing from the contract or documented without its errors and bearer auth.
	it('documents the lab scenario registration when the lab is enabled', async () => {
		const { body } = await request(app.getHttpServer()).get('/docs-json')
		const register = body.paths['/__test/scenarios'].post

		expect(Object.keys(register.responses).sort()).toEqual(['201', '400', '401'])
		expect(register.security).toEqual([{ bearer: [] }])
		expect(register.responses['400'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ErrorEnvelopeResponse',
		)
		expect(body.components.schemas.RegisterScenarioRequest.properties.outcome.enum).toEqual([
			'SUCCEED',
			'FAIL',
			'DEFERRED',
			'RATE_LIMIT',
			'ERROR_BEFORE_COMMIT',
			'ERROR_AFTER_COMMIT',
		])
	})

	// AC-12/AC-24/AC-25: catches the advance route missing from the lab contract or documented
	// without its errors and bearer auth.
	it('documents the lab advance when the lab is enabled', async () => {
		const { body } = await request(app.getHttpServer()).get('/docs-json')
		const advance = body.paths['/__test/transactions/{providerTransactionId}/advance'].post

		expect(Object.keys(advance.responses).sort()).toEqual(['200', '400', '401', '404', '409'])
		expect(advance.security).toEqual([{ bearer: [] }])
		expect(advance.responses['200'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ProviderTransactionResponse',
		)
		expect(advance.responses['409'].content['application/json'].schema.$ref).toBe(
			'#/components/schemas/ErrorEnvelopeResponse',
		)
		expect(
			body.components.schemas.AdvanceProviderTransactionRequest.properties.status.enum,
		).toEqual(['SUCCEEDED', 'FAILED'])
	})
})
