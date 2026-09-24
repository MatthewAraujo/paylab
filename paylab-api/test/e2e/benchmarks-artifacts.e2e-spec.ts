import { mkdirSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import request from 'supertest'
import { type BenchmarkFixture, SECRET, buildBenchmarkApp } from '../support/benchmark-app'

describe('Benchmark Artifacts (E2E)', () => {
	let fixture: BenchmarkFixture
	const get = (path: string) => request(fixture.app.getHttpServer()).get(path)
	const base = '/v1/benchmarks/runs/r1/artifacts'

	beforeAll(async () => {
		fixture = await buildBenchmarkApp()
		fixture.publish({
			runId: 'r1',
			artifacts: [
				{ id: 'fake.a-log', kind: 'LOG', label: 'fake.a log', scenarioId: 'fake.a' },
				{ id: 'fake.a-plan', kind: 'QUERY_PLAN', label: 'plan', scenarioId: 'fake.a' },
				{ id: 'gone', kind: 'LOG', label: 'deleted by hand' },
				{ id: 'escape', kind: 'LOG', label: 'a symlink' },
				{ id: 'secret', kind: 'LOG', label: 'a log that leaked' },
				{ id: 'big', kind: 'RAW_DATA', label: 'large samples' },
			],
		})
		fixture.artifact('r1', 'fake.a-log.log', 'aaaa\nbbbb\ncccc\ndddd\n')
		fixture.artifact('r1', 'fake.a-plan.plan.txt', 'Limit\nExecution Time: 1 ms\n')
		fixture.artifact(
			'r1',
			'secret.log',
			`key ${SECRET}\nurl postgresql://u:pw@localhost/db\nDB_PASSWORD=abc123\n`,
		)
		fixture.artifact('r1', 'big.jsonl', `${'{"latencyMs":1.5}\n'.repeat(20_000)}`)
		fixture.write('outside.txt', 'top secret outside the artifact directory')
		mkdirSync(join(fixture.root, '.benchmark', 'runs', 'r1', 'artifacts'), { recursive: true })
		symlinkSync(
			join(fixture.root, 'outside.txt'),
			join(fixture.root, '.benchmark', 'runs', 'r1', 'artifacts', 'escape.log'),
		)

		fixture.write('docs/experiments/raw/x.jsonl', '{"legacy":true}\n')
		fixture.publish({
			runId: 'imp',
			kind: 'imported',
			imported: { source: 'docs/experiments/T14-results.md' },
			artifacts: [
				{ id: 'raw', kind: 'RAW_DATA', label: 'raw', legacyFile: 'docs/experiments/raw/x.jsonl' },
			],
		})

		fixture.running('live-1')
		fixture.artifact('live-1', 'fake.a-log.log', 'started\nstill going\n')
	})
	afterAll(async () => fixture?.close())

	describe('metadata', () => {
		it('describes an Artifact and whether its file exists', async () => {
			const response = await get(`${base}/fake.a-log`)

			expect(response.statusCode).toBe(200)
			expect(response.body).toEqual({
				id: 'fake.a-log',
				kind: 'LOG',
				label: 'fake.a log',
				scenarioId: 'fake.a',
				available: true,
				sizeBytes: 20,
			})
		})

		it('says so, without failing, when the local file is gone', async () => {
			const response = await get(`${base}/gone`)

			expect(response.statusCode).toBe(200)
			expect(response.body).toMatchObject({ id: 'gone', available: false })
			expect(response.body.sizeBytes).toBeUndefined()
		})

		it('knows only the Artifacts the record lists', async () => {
			const unknown = await get(`${base}/state`)
			const unknownRun = await get('/v1/benchmarks/runs/nope/artifacts/x')

			expect(unknown.statusCode).toBe(404)
			expect(unknown.body).toMatchObject({ code: 'BENCHMARK_ARTIFACT_NOT_FOUND' })
			expect(unknownRun.body).toMatchObject({ code: 'BENCHMARK_RUN_NOT_FOUND' })
		})

		it('rejects an identifier that could name a path before touching the disk', async () => {
			for (const id of ['..%2F..%2Fstate', '..%2Foutside.txt', '%2Fetc%2Fpasswd', '.hidden']) {
				const response = await get(`${base}/${id}`)
				expect(response.statusCode, id).toBe(422)
			}
		})

		it('treats a file that resolves outside its directory as unavailable', async () => {
			const meta = await get(`${base}/escape`)
			const content = await get(`${base}/escape/content`)
			const download = await get(`${base}/escape/download`)

			expect(meta.body).toMatchObject({ available: false })
			expect(content.statusCode).toBe(404)
			expect(download.statusCode).toBe(404)
			expect(JSON.stringify([content.body, download.text])).not.toContain('top secret')
		})

		it('serves an imported Run’s evidence in place', async () => {
			const meta = await get('/v1/benchmarks/runs/imp/artifacts/raw')
			const content = await get('/v1/benchmarks/runs/imp/artifacts/raw/content')

			expect(meta.body).toMatchObject({ available: true, sizeBytes: 16 })
			expect(content.body.content).toBe('{"legacy":true}\n')
		})
	})

	describe('content', () => {
		it('returns a small Artifact whole', async () => {
			const response = await get(`${base}/fake.a-plan/content`)

			expect(response.body).toEqual({
				content: 'Limit\nExecution Time: 1 ms\n',
				offset: 0,
				nextOffset: null,
				sizeBytes: 27,
			})
		})

		it('reads in bounded chunks of whole lines and says where the next starts', async () => {
			const first = await get(`${base}/fake.a-log/content?limit=12`)
			const second = await get(
				`${base}/fake.a-log/content?offset=${first.body.nextOffset}&limit=12`,
			)

			expect(first.body).toMatchObject({ content: 'aaaa\nbbbb\n', nextOffset: 10, sizeBytes: 20 })
			expect(second.body).toMatchObject({ content: 'cccc\ndddd\n', nextOffset: null })
		})

		it('never returns more than the inline cap, however large the Artifact', async () => {
			const response = await get(`${base}/big/content?limit=262144`)

			expect(Buffer.byteLength(response.body.content)).toBeLessThanOrEqual(262144)
			expect(response.body.nextOffset).toEqual(expect.any(Number))
			expect(response.body.sizeBytes).toBeGreaterThan(300_000)
		})

		it('rejects offsets and limits outside the bounds', async () => {
			for (const query of ['offset=-1', 'limit=0', 'limit=262145', 'limit=abc', 'extra=1']) {
				const response = await get(`${base}/fake.a-log/content?${query}`)
				expect(response.statusCode, query).toBe(422)
			}
		})

		it('redacts secrets, database URLs, and credentials even if they reached the file', async () => {
			const response = await get(`${base}/secret/content`)

			expect(response.body.content).not.toContain(SECRET)
			expect(response.body.content).not.toContain('pw@')
			expect(response.body.content).not.toContain('abc123')
			expect(response.body.content).toContain('[REDACTED_DATABASE_URL]')
		})

		it('answers 404 when the file is gone', async () => {
			const response = await get(`${base}/gone/content`)

			expect(response.statusCode).toBe(404)
			expect(response.body).toMatchObject({ code: 'BENCHMARK_ARTIFACT_UNAVAILABLE' })
		})

		it('shows the log of the scenario running now, before it is registered', async () => {
			const response = await get('/v1/benchmarks/runs/live-1/artifacts/fake.a-log/content')

			expect(response.statusCode).toBe(200)
			expect(response.body.content).toBe('started\nstill going\n')
		})
	})

	describe('download', () => {
		it('streams the complete file as a text attachment', async () => {
			const response = await get(`${base}/big/download`).buffer(true)

			expect(response.statusCode).toBe(200)
			expect(response.headers['content-type']).toMatch(/^text\/plain/)
			expect(response.headers['content-disposition']).toBe('attachment; filename="big.jsonl"')
			expect(response.text.length).toBe(20_000 * 18)
		})

		it('applies the same redaction', async () => {
			const response = await get(`${base}/secret/download`).buffer(true)

			expect(response.text).not.toContain(SECRET)
			expect(response.text).toContain('[REDACTED_DATABASE_URL]')
		})

		it('answers 404 when the file is gone', async () => {
			expect((await get(`${base}/gone/download`)).statusCode).toBe(404)
		})
	})

	it('lists every Artifact with its availability in the Run detail', async () => {
		const response = await get('/v1/benchmarks/runs/r1')

		expect(response.body.artifacts.map((a: any) => [a.id, a.available])).toEqual([
			['fake.a-log', true],
			['fake.a-plan', true],
			['gone', false],
			['escape', false],
			['secret', true],
			['big', true],
		])
	})
})
