import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import { type BenchmarkFixture, buildBenchmarkApp } from '../support/benchmark-app'
import { buildMetric, buildScenario } from '../support/benchmark-fixtures'

const day = (n: number) => `2026-09-${String(n).padStart(2, '0')}T10:00:00.000Z`

describe('Benchmark Runs (E2E)', () => {
	let fixture: BenchmarkFixture
	const get = (path: string) => request(fixture.app.getHttpServer()).get(path)

	beforeAll(async () => {
		fixture = await buildBenchmarkApp()
		fixture.publish({
			runId: 'r1',
			startedAt: day(21),
			finishedAt: day(21),
			note: 'first',
			scenarios: [
				buildScenario({
					id: 'hot',
					metrics: [
						buildMetric({ summaryRole: 'THROUGHPUT', value: 111 }),
						buildMetric({ key: 'errors', value: 0 }),
					],
				}),
			],
		})
		fixture.publish({
			runId: 'r2',
			startedAt: day(22),
			finishedAt: day(22),
			status: 'INCOMPLETE',
			failure: { scenarioId: 'hot', summary: 'boom' },
			scenarios: [buildScenario({ id: 'hot', status: 'FAILED', metrics: [] })],
		})
		fixture.publish({
			runId: 'r3',
			startedAt: day(23),
			finishedAt: undefined,
			kind: 'imported',
			imported: { source: 'docs/experiments/T14-results.md' },
			artifacts: [
				{ id: 'raw', kind: 'RAW_DATA', label: 'raw', legacyFile: 'docs/experiments/raw/x.jsonl' },
			],
		})
		fixture.running('live-1', { startedAt: day(24) })
		fixture.write('bench/results/broken.json', '{not json')
	})
	afterAll(async () => fixture?.close())

	describe('list', () => {
		it('is newest first, light, and includes the Run that is still running', async () => {
			const response = await get('/v1/benchmarks/runs')

			expect(response.statusCode).toBe(200)
			expect(response.body.items.map((i: any) => [i.runId, i.status, i.kind])).toEqual([
				['live-1', 'RUNNING', 'native'],
				['r3', 'COMPLETED', 'imported'],
				['r2', 'INCOMPLETE', 'native'],
				['r1', 'COMPLETED', 'native'],
			])
			expect(response.body.nextCursor).toBeNull()
			for (const item of response.body.items) {
				expect(item).not.toHaveProperty('scenarios')
			}
			const r1 = response.body.items.find((i: any) => i.runId === 'r1')
			expect(r1.headlineMetrics).toEqual([
				{
					scenarioId: 'hot',
					key: 'tps',
					label: 'Throughput',
					unit: 'tx/s',
					value: 111,
					summaryRole: 'THROUGHPUT',
				},
			])
			expect(r1.scenarioCounts).toMatchObject({ total: 1, completed: 1 })
			expect(response.body.items.find((i: any) => i.runId === 'r2').failure).toEqual({
				scenarioId: 'hot',
				summary: 'boom',
			})
		})

		it('isolates a malformed record instead of failing, and reports it', async () => {
			const response = await get('/v1/benchmarks/runs')

			expect(response.statusCode).toBe(200)
			expect(response.body.skipped).toEqual([{ file: 'broken.json', reason: 'not valid JSON' }])
		})

		it('pages with an opaque cursor, without gaps or repeats', async () => {
			const first = await get('/v1/benchmarks/runs?limit=3')
			const second = await get(`/v1/benchmarks/runs?limit=3&cursor=${first.body.nextCursor}`)

			expect(first.body.items.map((i: any) => i.runId)).toEqual(['live-1', 'r3', 'r2'])
			expect(first.body.nextCursor).toEqual(expect.any(String))
			expect(second.body.items.map((i: any) => i.runId)).toEqual(['r1'])
			expect(second.body.nextCursor).toBeNull()
		})

		it('filters by status', async () => {
			const response = await get('/v1/benchmarks/runs?status=INCOMPLETE')

			expect(response.body.items.map((i: any) => i.runId)).toEqual(['r2'])
		})

		it('rejects bad query parameters with a validation error, never a clamp', async () => {
			for (const query of ['limit=0', 'limit=101', 'cursor=nope', 'offset=5', 'status=DONE']) {
				const response = await get(`/v1/benchmarks/runs?${query}`)
				expect(response.statusCode, query).toBe(422)
				expect(response.body.code).toBe('VALIDATION_ERROR')
			}
		})
	})

	describe('detail', () => {
		it('returns the complete record with every Artifact and whether its file exists', async () => {
			const response = await get('/v1/benchmarks/runs/r3')

			expect(response.statusCode).toBe(200)
			expect(response.body).toMatchObject({
				runId: 'r3',
				kind: 'imported',
				imported: { source: 'docs/experiments/T14-results.md' },
				environment: { fingerprint: 'env-1' },
				scenarios: [expect.objectContaining({ id: 't14.settle.hot' })],
				abandoned: false,
			})
			expect(response.body.artifacts).toEqual([
				expect.objectContaining({ id: 'raw', kind: 'RAW_DATA', available: false }),
			])
		})

		it('keeps the measurements of an incomplete Run and its failure evidence', async () => {
			const response = await get('/v1/benchmarks/runs/r2')

			expect(response.body).toMatchObject({
				status: 'INCOMPLETE',
				failure: { summary: 'boom' },
				scenarios: [{ id: 'hot', status: 'FAILED' }],
			})
		})

		it('answers 404 for an unknown Run and 422 for an identifier that could name a path', async () => {
			const missing = await get('/v1/benchmarks/runs/nope')
			const traversal = await get('/v1/benchmarks/runs/..%2F..%2Fetc%2Fpasswd')

			expect(missing.statusCode).toBe(404)
			expect(missing.body).toMatchObject({ code: 'BENCHMARK_RUN_NOT_FOUND' })
			expect(traversal.statusCode).toBe(422)
		})
	})

	describe('progress', () => {
		it('shows the scenario running now, and that the owner is alive', async () => {
			writeFileSync(
				join(fixture.root, '.benchmark', 'lock.json'),
				JSON.stringify({ pid: process.pid, runId: 'live-1', startedAt: day(24) }),
			)

			const progress = await get('/v1/benchmarks/runs/live-1/progress')
			const status = await get('/v1/benchmarks/status')

			expect(progress.statusCode).toBe(200)
			expect(progress.body).toMatchObject({
				runId: 'live-1',
				status: 'RUNNING',
				current: 'fake.a',
				completed: 0,
				total: 1,
				abandoned: false,
				scenarios: [{ id: 'fake.a', status: 'ACTIVE' }],
			})
			expect(status.body.activeRunId).toBe('live-1')
		})

		it('flags a RUNNING record whose owner is gone, so a client stops polling it', async () => {
			writeFileSync(
				join(fixture.root, '.benchmark', 'lock.json'),
				JSON.stringify({ pid: 2 ** 22 + 12345, runId: 'live-1', startedAt: day(24) }),
			)

			const progress = await get('/v1/benchmarks/runs/live-1/progress')

			expect(progress.body).toMatchObject({ status: 'RUNNING', abandoned: true })
			expect((await get('/v1/benchmarks/status')).body.activeRunId).toBeNull()
		})

		it('is terminal for a finished Run', async () => {
			const progress = await get('/v1/benchmarks/runs/r2/progress')

			expect(progress.body).toMatchObject({
				status: 'INCOMPLETE',
				current: null,
				abandoned: false,
				failure: { summary: 'boom' },
			})
		})

		it('answers 404 for an unknown Run', async () => {
			expect((await get('/v1/benchmarks/runs/nope/progress')).statusCode).toBe(404)
		})
	})
})
