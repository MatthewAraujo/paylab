import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { BENCHMARK_CONFIG } from '@/infra/benchmark/benchmark.config'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { buildTestApp } from '../support/app'

// The API pointed at the repository's own versioned evidence: the three Runs imported from the
// T13 and T14 experiments. Only the local Artifact root is temporary.
describe('Benchmark API on the imported evidence (E2E)', () => {
	let app: INestApplication
	let scratch: string
	const get = (path: string) => request(app.getHttpServer()).get(path)

	beforeAll(async () => {
		scratch = mkdtempSync(join(tmpdir(), 'paylab-real-evidence-'))
		app = await buildTestApp((builder) =>
			builder.overrideProvider(BENCHMARK_CONFIG).useValue({
				enabled: true,
				paths: {
					rootDir: process.cwd(),
					summaryDir: join(process.cwd(), 'bench', 'results'),
					artifactRoot: scratch,
				},
			}),
		)
	})
	afterAll(async () => {
		await app?.close()
		rmSync(scratch, { recursive: true, force: true })
	})

	it('lists the imported Runs, newest first, with no unreadable record', async () => {
		const response = await get('/v1/benchmarks/runs')

		expect(response.body.skipped).toEqual([])
		expect(response.body.items.map((i: any) => [i.runId, i.kind, i.status])).toEqual([
			['imported-t14-load-v2', 'imported', 'COMPLETED'],
			['imported-t13-step2-adopted', 'imported', 'COMPLETED'],
			['imported-t13-step1-baseline', 'imported', 'COMPLETED'],
		])
		const t14 = response.body.items[0]
		expect(t14.scenarioCounts.total).toBe(17)
		expect(t14.headlineMetrics.length).toBeGreaterThan(0)
		expect(t14.source).toEqual({ commit: 'unknown', branch: 'unknown' })
	})

	it('returns the complete T14 record, with the evidence files it references', async () => {
		const response = await get('/v1/benchmarks/runs/imported-t14-load-v2')

		expect(response.statusCode).toBe(200)
		expect(response.body.scenarios).toHaveLength(17)
		expect(response.body.artifacts.map((a: any) => [a.id, a.available])).toEqual([
			['load-samples', true],
			['correctness-record', true],
		])
	})

	it('serves the recorded evidence in place: raw driver lines and the correctness record', async () => {
		const raw = await get(
			'/v1/benchmarks/runs/imported-t14-load-v2/artifacts/load-samples/content?limit=2000',
		)
		const record = await get(
			'/v1/benchmarks/runs/imported-t14-load-v2/artifacts/correctness-record/content',
		)

		expect(raw.body.content.split('\n')[0]).toContain('"strategy":"forupdate"')
		expect(raw.body.nextOffset).toEqual(expect.any(Number))
		expect(record.body.content).toContain('FAIL forupdate')
	})

	it('draws the trend of a T13 query across the two schema states, both comparable', async () => {
		const response = await get(
			'/v1/benchmarks/trends?scenarioId=t13.history.first-page.hot-wallet&metric=query_latency_median_ms',
		)

		expect(response.body.points.map((p: any) => [p.runId, p.value])).toEqual([
			['imported-t13-step1-baseline', 57.742],
			['imported-t13-step2-adopted', 0.108],
		])
		expect(response.body.direction).toBe('LOWER_IS_BETTER')
	})

	it('draws a T14 trend for one strategy through the dimension', async () => {
		const response = await get(
			'/v1/benchmarks/trends?scenarioId=t14.load.H.c4.sync-on&metric=tps&dimension=strategy:nokey',
		)

		expect(response.body.points.map((p: any) => p.value)).toEqual([62.1])
	})

	it('compares the two T13 schema states scenario by scenario', async () => {
		const response = await get(
			'/v1/benchmarks/comparisons?current=imported-t13-step2-adopted&reference=imported-t13-step1-baseline',
		)

		expect(response.body.comparison.environmentCompatible).toBe(true)
		expect(
			response.body.comparison.scenarios.filter((s: any) => s.state === 'comparable'),
		).toHaveLength(33)
	})

	it('has no default reference for T14: no earlier Run shares a comparable scenario', async () => {
		const response = await get('/v1/benchmarks/comparisons/default')

		expect(response.body.current.runId).toBe('imported-t14-load-v2')
		expect(response.body.reference).toBeNull()
	})
})
