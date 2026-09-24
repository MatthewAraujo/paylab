import { INestApplication } from '@nestjs/common'
import request from 'supertest'

// The real environment resolution, with nothing overridden: what a production deployment gets.
// The configuration is read when the application module is first imported, so each case starts
// from a fresh module registry with the environment it is testing. Refusing to start with the
// surface enabled in production is covered where the validation lives (test/infra/env).
const SURFACE = [
	'/v1/benchmarks/status',
	'/v1/benchmarks/runs',
	'/v1/benchmarks/runs/any',
	'/v1/benchmarks/baseline',
	'/v1/benchmarks/comparisons/default',
	'/v1/benchmarks/trends?scenarioId=s&metric=m',
]

describe('Benchmark API in production mode (E2E)', () => {
	const saved = { NODE_ENV: process.env.NODE_ENV, BENCHMARK_ENABLED: process.env.BENCHMARK_ENABLED }
	let app: INestApplication | undefined

	afterEach(async () => {
		await app?.close()
		app = undefined
		for (const [key, value] of Object.entries(saved)) {
			if (value === undefined) Reflect.deleteProperty(process.env, key)
			else process.env[key] = value
		}
		vi.resetModules()
	})

	async function boot() {
		vi.resetModules()
		const { buildTestApp } = await import('../support/app')
		app = await buildTestApp()
		return app
	}

	it('exposes no benchmark route, including the Baseline write', async () => {
		process.env.NODE_ENV = 'production'
		Reflect.deleteProperty(process.env, 'BENCHMARK_ENABLED')
		const running = await boot()
		const server = running.getHttpServer()

		for (const route of SURFACE) {
			expect((await request(server).get(route)).statusCode, route).toBe(404)
		}
		const write = await request(server).put('/v1/benchmarks/baseline').send({ runId: 'x' })
		expect(write.statusCode).toBe(404)
	})

	it('is also off by default in the test environment, and on only when asked', async () => {
		process.env.NODE_ENV = 'test'
		Reflect.deleteProperty(process.env, 'BENCHMARK_ENABLED')
		const off = await boot()
		expect((await request(off.getHttpServer()).get('/v1/benchmarks/status')).statusCode).toBe(404)
		await off.close()
		app = undefined

		process.env.BENCHMARK_ENABLED = 'true'
		const on = await boot()
		expect((await request(on.getHttpServer()).get('/v1/benchmarks/status')).statusCode).toBe(200)
	})
})
