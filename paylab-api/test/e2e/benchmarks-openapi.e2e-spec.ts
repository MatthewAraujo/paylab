import { buildOpenApiDocument } from '@/infra/http/openapi/swagger'
import request from 'supertest'
import { type BenchmarkFixture, buildBenchmarkApp } from '../support/benchmark-app'
import { buildMetric, buildScenario } from '../support/benchmark-fixtures'
import { bodyMatchesSchema, responseSchema } from '../support/openapi'

type Json = Record<string, any>

// The Operational Console generates its client from this document: every benchmark route must
// describe its response and its parameters, and say that it needs no Merchant credential.

const ROUTES = [
	'/v1/benchmarks/status',
	'/v1/benchmarks/runs',
	'/v1/benchmarks/runs/{runId}',
	'/v1/benchmarks/runs/{runId}/progress',
	'/v1/benchmarks/runs/{runId}/artifacts/{artifactId}',
	'/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content',
	'/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/download',
	'/v1/benchmarks/comparisons/default',
	'/v1/benchmarks/comparisons',
	'/v1/benchmarks/trends',
	'/v1/benchmarks/baseline',
]

const QUERY: Record<string, string[]> = {
	'/v1/benchmarks/runs': ['limit', 'cursor', 'status'],
	'/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content': ['offset', 'limit'],
	'/v1/benchmarks/comparisons': ['current', 'reference'],
	'/v1/benchmarks/trends': ['scenarioId', 'metric', 'dimension'],
}

describe('OpenAPI contract of the benchmark routes (E2E)', () => {
	let fixture: BenchmarkFixture
	let document: Json

	beforeAll(async () => {
		fixture = await buildBenchmarkApp()
		document = buildOpenApiDocument(fixture.app) as Json
	})
	afterAll(async () => fixture?.close())

	test.each(ROUTES)('%s is documented, typed, and needs no credential', (path) => {
		const operation = document.paths[path]?.get

		expect(operation, 'documented').toBeDefined()
		expect(operation.tags).toEqual(['Benchmarks'])
		expect(operation.security).toBeUndefined()
		expect(operation.responses['200']).toBeDefined()
		expect(operation.responses['401']).toBeUndefined()
	})

	test('the download route documents a text attachment, and the others JSON', () => {
		const download = document.paths['/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/download']
		expect(Object.keys(download.get.responses['200'].content)).toContain('text/plain')
		for (const path of ROUTES.filter((p) => !p.endsWith('/download'))) {
			expect(responseSchema(document, path), path).toBeDefined()
		}
	})

	test.each(Object.entries(QUERY))('%s declares its query parameters', (path, names) => {
		const declared = document.paths[path].get.parameters
			.filter((parameter: Json) => parameter.in === 'query')
			.map((parameter: Json) => parameter.name)

		expect(declared.sort()).toEqual([...names].sort())
	})

	test('routes with identifiers declare their path parameters and a 404', () => {
		for (const path of ROUTES.filter((p) => p.includes('{runId}'))) {
			const parameters = document.paths[path].get.parameters
			expect(
				parameters.some((p: Json) => p.in === 'path' && p.name === 'runId'),
				path,
			).toBe(true)
			expect(document.paths[path].get.responses['404'], path).toBeDefined()
			expect(document.paths[path].get.responses['422'], path).toBeDefined()
		}
	})

	test('real responses match the documented schemas', async () => {
		const at = (day: number) => ({
			startedAt: `2026-09-${String(day).padStart(2, '0')}T10:00:00.000Z`,
			finishedAt: `2026-09-${String(day).padStart(2, '0')}T11:00:00.000Z`,
		})
		const rich = (id: string, value: number) =>
			buildScenario({
				id,
				fingerprint: `fp-${id}`,
				metrics: [
					buildMetric({ value, summaryRole: 'THROUGHPUT', dimensions: { strategy: 'nokey' } }),
					buildMetric({ key: 'p99', direction: 'LOWER_IS_BETTER', unit: 'ms', value: 9 }),
				],
			})
		fixture.publish({
			runId: 'r1',
			...at(20),
			note: 'first',
			scenarios: [rich('hot', 100)],
			artifacts: [{ id: 'log', kind: 'LOG', label: 'log', scenarioId: 'hot' }],
		})
		fixture.artifact('r1', 'log.log', 'one\ntwo\n')
		fixture.publish({ runId: 'r2', ...at(21), scenarios: [rich('hot', 120)] })
		fixture.publish({
			runId: 'r3',
			...at(22),
			status: 'INCOMPLETE',
			failure: { scenarioId: 'hot', command: 'node x', exitStatus: 1, summary: 'boom' },
			scenarios: [buildScenario({ id: 'hot', status: 'FAILED', metrics: [] })],
		})
		fixture.publish({
			runId: 'imp',
			...at(19),
			finishedAt: undefined,
			kind: 'imported',
			imported: { source: 'docs/experiments/T14-results.md' },
		})
		fixture.running('live-1', { startedAt: at(23).startedAt })
		fixture.write('bench/results/broken.json', '{')

		const calls: [string, string][] = [
			['/v1/benchmarks/status', '/v1/benchmarks/status'],
			['/v1/benchmarks/runs', '/v1/benchmarks/runs'],
			['/v1/benchmarks/runs/{runId}', '/v1/benchmarks/runs/r1'],
			['/v1/benchmarks/runs/{runId}', '/v1/benchmarks/runs/r3'],
			['/v1/benchmarks/runs/{runId}', '/v1/benchmarks/runs/imp'],
			['/v1/benchmarks/runs/{runId}', '/v1/benchmarks/runs/live-1'],
			['/v1/benchmarks/runs/{runId}/progress', '/v1/benchmarks/runs/live-1/progress'],
			['/v1/benchmarks/runs/{runId}/progress', '/v1/benchmarks/runs/r3/progress'],
			[
				'/v1/benchmarks/runs/{runId}/artifacts/{artifactId}',
				'/v1/benchmarks/runs/r1/artifacts/log',
			],
			[
				'/v1/benchmarks/runs/{runId}/artifacts/{artifactId}/content',
				'/v1/benchmarks/runs/r1/artifacts/log/content',
			],
			['/v1/benchmarks/comparisons/default', '/v1/benchmarks/comparisons/default'],
			['/v1/benchmarks/comparisons', '/v1/benchmarks/comparisons?current=r2&reference=r1'],
			[
				'/v1/benchmarks/trends',
				'/v1/benchmarks/trends?scenarioId=hot&metric=tps&dimension=strategy:nokey',
			],
			['/v1/benchmarks/trends', '/v1/benchmarks/trends?scenarioId=nope&metric=tps'],
		]

		for (const [path, url] of calls) {
			const response = await request(fixture.app.getHttpServer()).get(url)
			expect(response.statusCode, url).toBe(200)
			expect(
				bodyMatchesSchema(document, response.body, responseSchema(document, path), url),
				url,
			).toEqual([])
		}
	})

	test('error bodies match the documented error schemas', async () => {
		const missing = await request(fixture.app.getHttpServer()).get('/v1/benchmarks/runs/nope')
		const invalid = await request(fixture.app.getHttpServer()).get('/v1/benchmarks/runs?limit=0')

		expect(
			bodyMatchesSchema(
				document,
				missing.body,
				responseSchema(document, '/v1/benchmarks/runs/{runId}', '404'),
				'404',
			),
		).toEqual([])
		expect(
			bodyMatchesSchema(
				document,
				invalid.body,
				responseSchema(document, '/v1/benchmarks/runs', '422'),
				'422',
			),
		).toEqual([])
	})

	test('selecting the Baseline is documented with its body and its errors, and needs no credential', () => {
		const put = document.paths['/v1/benchmarks/baseline'].put

		expect(put.tags).toEqual(['Benchmarks'])
		expect(put.security).toBeUndefined()
		expect(put.requestBody.content['application/json'].schema.$ref).toContain(
			'SelectBaselineRequest',
		)
		expect(document.components.schemas.SelectBaselineRequest.required).toEqual(['runId'])
		for (const status of ['200', '404', '422']) expect(put.responses[status], status).toBeDefined()
		expect(document.paths['/v1/benchmarks/baseline'].post).toBeUndefined()
	})

	test('real Baseline responses match the documented schemas', async () => {
		const server = fixture.app.getHttpServer()
		fixture.publish({
			runId: 'b1',
			startedAt: '2026-09-20T10:00:00.000Z',
			finishedAt: '2026-09-20T11:00:00.000Z',
		})
		const schema = (status = '200', method: 'get' | 'put' = 'get') =>
			document.paths['/v1/benchmarks/baseline'][method]?.responses?.[status]?.content?.[
				'application/json'
			]?.schema

		const none = await request(server).get('/v1/benchmarks/baseline')
		const selected = await request(server).put('/v1/benchmarks/baseline').send({ runId: 'b1' })
		const read = await request(server).get('/v1/benchmarks/baseline')
		const ineligible = await request(server)
			.put('/v1/benchmarks/baseline')
			.send({ runId: 'live-1' })

		expect(bodyMatchesSchema(document, none.body, schema(), 'none')).toEqual([])
		expect(bodyMatchesSchema(document, selected.body, schema('200', 'put'), 'put')).toEqual([])
		expect(bodyMatchesSchema(document, read.body, schema(), 'read')).toEqual([])
		expect(ineligible.statusCode).toBe(422)
		expect(bodyMatchesSchema(document, ineligible.body, schema('422', 'put'), '422')).toEqual([])
	})
})
