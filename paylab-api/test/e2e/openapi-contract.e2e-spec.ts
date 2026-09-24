import { buildOpenApiDocument } from '@/infra/http/openapi/swagger'
import { INestApplication } from '@nestjs/common'
import { buildTestApp } from '../support/app'
import { provisionMerchant } from '../support/merchants'
import { createWallet, fund, postPayment } from '../support/payments'
import { get } from '../support/reads'

// The Operational Console generates its client from this document, so every read
// route must describe its response, its query parameters and its auth.

type Json = Record<string, any>

const READ_ROUTES = [
	['/v1/accounts', 'list'],
	['/v1/accounts/{id}', 'get'],
	['/v1/accounts/{id}/balance', 'balance'],
	['/v1/accounts/{id}/entries', 'entries'],
	['/v1/payments', 'list'],
	['/v1/payments/{id}', 'get'],
	['/v1/reports/daily', 'daily'],
] as const

const PAGE_QUERY = ['limit', 'cursor']
const QUERY_PARAMETERS: Record<string, string[]> = {
	'/v1/accounts': PAGE_QUERY,
	'/v1/accounts/{id}/entries': PAGE_QUERY,
	'/v1/payments': [...PAGE_QUERY, 'accountId', 'status', 'from', 'to'],
	'/v1/reports/daily': ['from', 'to'],
}

describe('OpenAPI contract of the read routes (E2E)', () => {
	let app: INestApplication
	let document: Json

	beforeAll(async () => {
		app = await buildTestApp()
		document = buildOpenApiDocument(app) as Json
	})

	afterAll(async () => {
		await app?.close()
	})

	function resolve(schema: Json): Json {
		if (!schema.$ref) {
			return schema
		}
		const name = (schema.$ref as string).replace('#/components/schemas/', '')
		return document.components.schemas[name]
	}

	function responseSchema(path: string, status: string): Json | undefined {
		return document.paths[path]?.get?.responses?.[status]?.content?.['application/json']?.schema
	}

	// Every key of a real body is documented and every required key is present.
	function expectBodyMatches(body: unknown, schema: Json | undefined, where: string) {
		expect(schema, `${where}: no schema`).toBeDefined()
		const resolved = resolve(schema as Json)

		if (resolved.type === 'array') {
			for (const item of body as unknown[]) {
				expectBodyMatches(item, resolved.items, `${where}[]`)
			}
			return
		}
		if (resolved.type !== 'object' || body === null || typeof body !== 'object') {
			return
		}

		const documented = Object.keys(resolved.properties ?? {})
		expect(Object.keys(body).sort(), `${where}: keys`).toEqual([...documented].sort())
		for (const [key, value] of Object.entries(body)) {
			expectBodyMatches(value, resolved.properties[key], `${where}.${key}`)
		}
	}

	test.each(READ_ROUTES)('%s declares a typed 200 response and a 401', (path) => {
		const okSchema = responseSchema(path, '200')

		expect(okSchema, 'typed 200 JSON response').toBeDefined()
		expect(document.paths[path].get.responses['401']).toBeDefined()
		expect(document.paths[path].get.security).toEqual([{ bearer: [] }])
	})

	test.each(Object.entries(QUERY_PARAMETERS))('%s declares its query parameters', (path, names) => {
		const declared = document.paths[path].get.parameters
			.filter((parameter: Json) => parameter.in === 'query')
			.map((parameter: Json) => parameter.name)

		expect(declared.sort()).toEqual([...names].sort())
	})

	test('id routes declare the path parameter and a 404', () => {
		for (const path of [
			'/v1/accounts/{id}',
			'/v1/accounts/{id}/balance',
			'/v1/accounts/{id}/entries',
			'/v1/payments/{id}',
		]) {
			const parameters = document.paths[path].get.parameters
			expect(parameters.some((p: Json) => p.in === 'path' && p.name === 'id')).toBe(true)
			expect(document.paths[path].get.responses['404']).toBeDefined()
		}
	})

	test('the error schema documents the { code, message } body', () => {
		const schema = resolve(responseSchema('/v1/accounts/{id}', '404') as Json)

		expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['code', 'message']))
	})

	test('a Bearer security scheme is defined', () => {
		expect(document.components.securitySchemes.bearer).toMatchObject({
			type: 'http',
			scheme: 'bearer',
		})
	})

	test('real responses match the documented schemas', async () => {
		const merchant = await provisionMerchant(app)
		const source = await createWallet(app, merchant)
		const destination = await createWallet(app, merchant)
		await fund(app, source, 1_000)
		const payment = await postPayment(app, merchant, {
			sourceAccountId: source,
			destinationAccountId: destination,
			amount: 100,
			currency: 'BRL',
		})
		const today = new Date().toISOString().slice(0, 10)

		const calls: [string, string][] = [
			['/v1/accounts', '/v1/accounts'],
			['/v1/accounts/{id}', `/v1/accounts/${source}`],
			['/v1/accounts/{id}/balance', `/v1/accounts/${source}/balance`],
			['/v1/accounts/{id}/entries', `/v1/accounts/${source}/entries`],
			['/v1/payments', '/v1/payments'],
			['/v1/payments/{id}', `/v1/payments/${payment.body.id}`],
			['/v1/reports/daily', `/v1/reports/daily?from=${today}&to=${today}`],
		]

		for (const [documented, actual] of calls) {
			const response = await get(app, merchant, actual)

			expect(response.statusCode, actual).toBe(200)
			expectBodyMatches(response.body, responseSchema(documented, '200'), documented)
		}
	})
})
