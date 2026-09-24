import request from 'supertest'
import { type BenchmarkFixture, buildBenchmarkApp } from '../support/benchmark-app'

const READ_ROUTES = [
	'/v1/benchmarks/status',
	'/v1/benchmarks/runs',
	'/v1/benchmarks/runs/any-run',
	'/v1/benchmarks/runs/any-run/progress',
	'/v1/benchmarks/runs/any-run/artifacts/any-artifact',
	'/v1/benchmarks/runs/any-run/artifacts/any-artifact/content',
	'/v1/benchmarks/runs/any-run/artifacts/any-artifact/download',
	'/v1/benchmarks/comparisons/default',
	'/v1/benchmarks/comparisons?current=a&reference=b',
	'/v1/benchmarks/trends?scenarioId=s&metric=m',
]

describe('Benchmark API availability (E2E)', () => {
	describe('when the capability is off (production, and the default outside development)', () => {
		let fixture: BenchmarkFixture

		beforeAll(async () => {
			fixture = await buildBenchmarkApp(false)
			fixture.publish({ runId: 'r1', note: 'distinctive-note-9f3a' })
		})
		afterAll(async () => fixture?.close())

		it.each(READ_ROUTES)('answers 404 for %s, even when evidence exists', async (route) => {
			const response = await request(fixture.app.getHttpServer()).get(route)

			expect(response.statusCode).toBe(404)
		})

		it('does not leak that evidence exists', async () => {
			const response = await request(fixture.app.getHttpServer()).get('/v1/benchmarks/runs/r1')

			expect(JSON.stringify(response.body)).not.toContain('distinctive-note-9f3a')
		})
	})

	describe('when the capability is on', () => {
		let fixture: BenchmarkFixture

		beforeAll(async () => {
			fixture = await buildBenchmarkApp(true)
		})
		afterAll(async () => fixture?.close())

		it('reports its status without any Merchant credential or benchmark database', async () => {
			const response = await request(fixture.app.getHttpServer()).get('/v1/benchmarks/status')

			expect(response.statusCode).toBe(200)
			expect(response.body).toEqual({
				enabled: true,
				runCount: 0,
				skippedRecords: 0,
				activeRunId: null,
			})
		})

		it('has no route that starts, changes, or deletes a Run', async () => {
			const server = fixture.app.getHttpServer()
			const targets = ['/v1/benchmarks/runs', '/v1/benchmarks/runs/r1', '/v1/benchmarks/status']

			for (const target of targets) {
				for (const method of ['post', 'put', 'patch', 'delete'] as const) {
					const response = await request(server)[method](target)
					expect(response.statusCode, `${method.toUpperCase()} ${target}`).toBe(404)
				}
			}
		})
	})
})
