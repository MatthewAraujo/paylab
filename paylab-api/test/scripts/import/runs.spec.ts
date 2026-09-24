import { compareRuns } from '@/domain/benchmark/comparison'
import { classifyChange } from '@/domain/benchmark/performance-change'
import { type BenchmarkSummary, parseSummary } from '@/domain/benchmark/summary'
import { T13_QUERIES } from '../../../bench/scenarios/t13-queries'
import { T14_CELLS } from '../../../bench/scenarios/t14-matrix'
import { readLegacySources } from '../../../scripts/benchmark/import/read'
import { buildImportedRuns, legacyLabelToId } from '../../../scripts/benchmark/import/runs'
import { ImportSourceError } from '../../../scripts/benchmark/import/sources'

const sources = () => readLegacySources(process.cwd())
const runs = () => buildImportedRuns(sources())
const byId = (id: string) => {
	const run = runs().find((r) => r.runId === id)
	if (!run) throw new Error(`no run ${id}`)
	return run
}
const scenario = (run: BenchmarkSummary, id: string) => {
	const found = run.scenarios.find((s) => s.id === id)
	if (!found) throw new Error(`no scenario ${id}`)
	return found
}
const metric = (run: BenchmarkSummary, id: string, key: string, strategy?: string) =>
	scenario(run, id).metrics.find((m) => m.key === key && m.dimensions?.strategy === strategy)

describe('legacyLabelToId', () => {
	it('maps every label of the recorded tables onto a scenario the native suite also registers', () => {
		const native = new Set(T13_QUERIES.map((q) => q.id))
		const { t13Adopted, t13Baseline } = sources()

		for (const text of [t13Adopted.queries, t13Baseline.queries]) {
			const labels = text
				.split('\n')
				.filter((l) => l.startsWith('| ') && !l.startsWith('| query') && !l.startsWith('| ---'))
				.map((l) => l.split('|')[1].trim())
			expect(labels).toHaveLength(23)
			for (const label of labels) expect(native.has(legacyLabelToId(label)), label).toBe(true)
		}
	})

	it('refuses a label it does not know instead of guessing', () => {
		expect(() => legacyLabelToId('history somewhere (warm wallet)')).toThrow(ImportSourceError)
	})
})

describe('the imported Runs', () => {
	it('are three separate validated Runs: T13 baseline, T13 adopted, and T14', () => {
		const all = runs()

		expect(all.map((r) => r.runId)).toEqual([
			'imported-t13-step1-baseline',
			'imported-t13-step2-adopted',
			'imported-t14-load-v2',
		])
		for (const run of all) {
			expect(parseSummary(run).isRight(), run.runId).toBe(true)
			expect(run.kind).toBe('imported')
			expect(run.status).toBe('COMPLETED')
			expect(run.imported?.source).toMatch(/^docs\/experiments\/T1[34]-results\.md$/)
		}
	})

	it('never combine T13 and T14 into one execution', () => {
		for (const run of runs()) {
			const groups = new Set(run.scenarios.map((s) => s.group))
			expect(groups.size, run.runId).toBe(1)
		}
	})

	it('say what they are and what was not recorded', () => {
		for (const run of runs()) {
			expect(run.note, run.runId).toMatch(/imported/i)
			expect(run.source).toEqual({ commit: 'unknown', branch: 'unknown' })
			expect(run.finishedAt).toBeUndefined()
			expect(run.durationMs).toBeUndefined()
			expect(run.executor.version).toBe('legacy-import-1')
		}
	})

	it('start at the time the source recorded, or at its recording date when it stored none', () => {
		expect(byId('imported-t14-load-v2').startedAt).toBe('2026-09-23T21:28:52.000Z')
		expect(byId('imported-t13-step1-baseline').startedAt).toBe('2026-09-23T20:14:51.000Z')
		expect(byId('imported-t13-step2-adopted').startedAt).toBe('2026-09-23T20:14:51.000Z')
	})

	it('preserve the recorded environment and the dataset', () => {
		const t13 = byId('imported-t13-step2-adopted')
		const t14 = byId('imported-t14-load-v2')

		expect(t13.environment.details).toMatchObject({
			platform: 'linux',
			cpuModel: 'AMD Ryzen 7 5825U',
			cpuCount: '16',
			memoryGb: '15',
			postgres: '16.15',
			shared_buffers: '1GB',
			work_mem: '32MB',
			effective_cache_size: '3GB',
			random_page_cost: '4',
			synchronous_commit: 'on',
		})
		expect(t14.environment.details).toMatchObject({
			node: '24.5.0',
			max_wal_size: '4GB',
			deadlock_timeout: '1s',
			max_connections: '100',
		})
		for (const run of [t13, t14]) {
			expect(run.dataset).toEqual({
				fingerprint: 'f827ada9033d9ffa27971798ff908eff',
				description: '1001000 payments, 1000 wallets, 50 merchants',
			})
		}
		expect(byId('imported-t13-step1-baseline').environment).toEqual(t13.environment)
	})

	it('reference the existing evidence files in place instead of copying them', () => {
		const adopted = byId('imported-t13-step2-adopted')

		expect(adopted.artifacts.map((a) => a.legacyFile)).toEqual([
			'docs/experiments/raw/final-adopted.txt',
			'docs/experiments/raw/depth-adopted.txt',
			'docs/experiments/plans/final-adopted.txt',
			'docs/experiments/plans/depth-adopted.txt',
		])
		expect(adopted.artifacts.map((a) => a.kind)).toEqual([
			'RAW_DATA',
			'RAW_DATA',
			'QUERY_PLAN',
			'QUERY_PLAN',
		])
		expect(byId('imported-t14-load-v2').artifacts.map((a) => a.legacyFile)).toEqual([
			'docs/experiments/raw/T14-load.jsonl',
			'docs/experiments/raw/T14-correctness.txt',
		])
	})
})

describe('the imported T13 measurements', () => {
	it('register the same 33 scenarios as the native T13 group, under the T13 protocol', () => {
		for (const id of ['imported-t13-step1-baseline', 'imported-t13-step2-adopted']) {
			const run = byId(id)

			expect(run.scenarios.map((s) => s.id).sort()).toEqual(T13_QUERIES.map((q) => q.id).sort())
			for (const s of run.scenarios) {
				expect(s.protocol).toEqual({ warmupRuns: 1, repetitions: 7, aggregation: 'median' })
				expect(s.status).toBe('COMPLETED')
			}
		}
	})

	it('keep the recorded values', () => {
		const baseline = byId('imported-t13-step1-baseline')
		const adopted = byId('imported-t13-step2-adopted')
		const key = 'query_latency_median_ms'

		expect(metric(adopted, 't13.history.first-page.hot-wallet', key)?.value).toBe(0.108)
		expect(metric(baseline, 't13.history.first-page.hot-wallet', key)?.value).toBe(57.742)
		expect(metric(adopted, 't13.balance.hot-wallet', key)?.value).toBe(13.063)
		expect(metric(adopted, 't13.depth.offset.50000', key)?.value).toBe(77.938)
		expect(metric(adopted, 't13.depth.keyset.50000', key)?.value).toBe(0.137)
	})

	it('leave what was not recorded absent: no minimum or maximum', () => {
		const first = scenario(byId('imported-t13-step2-adopted'), 't13.balance.hot-wallet')

		expect(first.metrics.map((m) => m.key)).toEqual(['query_latency_median_ms'])
		expect(first.startedAt).toBeUndefined()
	})

	it('are marked imported in every scenario, and the schema state is not part of the workload', () => {
		const baseline = scenario(byId('imported-t13-step1-baseline'), 't13.report.90d.cold-merchant')
		const adopted = scenario(byId('imported-t13-step2-adopted'), 't13.report.90d.cold-merchant')

		expect(adopted.config).toMatchObject({ origin: 'imported' })
		expect(adopted.config).not.toHaveProperty('schemaState')
		expect(adopted.fingerprint).toBe(baseline.fingerprint)
		expect(byId('imported-t13-step1-baseline').note).toMatch(/baseline/)
		expect(byId('imported-t13-step2-adopted').note).toMatch(/adopted/)
	})

	it('make the baseline and the adopted schema comparable, scenario by scenario', () => {
		const comparison = compareRuns(
			byId('imported-t13-step2-adopted'),
			byId('imported-t13-step1-baseline'),
		)

		expect(comparison.isRight()).toBe(true)
		if (comparison.isRight()) {
			expect(comparison.value.environmentCompatible).toBe(true)
			expect(comparison.value.datasetCompatible).toBe(true)
			expect(comparison.value.scenarios.filter((s) => s.state === 'comparable')).toHaveLength(33)
		}
		const change = classifyChange({
			current: 0.108,
			reference: 57.742,
			direction: 'LOWER_IS_BETTER',
		})
		expect(change).toMatchObject({ kind: 'compared', classification: 'improved' })
	})
})

describe('the imported T14 measurements', () => {
	const t14 = () => byId('imported-t14-load-v2')

	it('register the correctness gate and the 16 cells of the native T14 group, under its protocol', () => {
		expect(t14().scenarios.map((s) => s.id)).toEqual([
			't14.correctness',
			...T14_CELLS.map((c) => c.id),
		])
		for (const s of t14().scenarios.slice(1)) {
			expect(s.protocol).toEqual({
				warmupMs: 2000,
				durationMs: 10000,
				repetitions: 3,
				aggregation: 'median',
			})
			expect(s.config).toMatchObject({ origin: 'imported', rotation: 'latin-square' })
		}
	})

	it('reproduce the published cell: H, synchronous_commit=on, 4 clients, nokey', () => {
		const id = 't14.load.H.c4.sync-on'

		expect(metric(t14(), id, 'tps', 'nokey')?.value).toBe(62.1)
		expect(metric(t14(), id, 'tps_min', 'nokey')?.value).toBe(49.8)
		expect(metric(t14(), id, 'tps_max', 'nokey')?.value).toBe(91.1)
		expect(metric(t14(), id, 'tps', 'nokey')?.summaryRole).toBe('THROUGHPUT')
	})

	it('carry every strategy, and leave credit measurements absent where there were no credits', () => {
		const strategies = t14()
			.scenarios.find((s) => s.id === 't14.load.H.c4.sync-on')
			?.metrics.filter((m) => m.key === 'tps')
			.map((m) => m.dimensions?.strategy)
		const keys = scenario(t14(), 't14.load.H.c4.sync-on').metrics.map((m) => m.key)

		expect(strategies).toEqual(['nokey', 'forupdate', 'serializable', 'optimistic', 'advisory'])
		expect(keys.some((k) => k.startsWith('credit_'))).toBe(false)
		expect(
			scenario(t14(), 't14.load.M.c16.sync-on').metrics.some((m) => m.key === 'credit_tps'),
		).toBe(true)
	})

	it('keep the correctness record: the FOR UPDATE deadlocks and the elapsed time', () => {
		const gate = scenario(t14(), 't14.correctness')

		expect(metric(t14(), 't14.correctness', 'crossed_transfer_deadlocks', 'forupdate')?.value).toBe(
			3413,
		)
		expect(metric(t14(), 't14.correctness', 'correctness_violations', 'nokey')?.value).toBe(0)
		expect(gate.durationMs).toBe(946000)
	})
})

describe('a source that is not what was recorded', () => {
	it('is refused: a missing repetition breaks the accepted protocol', () => {
		const original = sources()
		const lines = original.t14.load.split('\n')
		const broken = { ...original, t14: { ...original.t14, load: lines.slice(1).join('\n') } }

		expect(() => buildImportedRuns(broken)).toThrow(ImportSourceError)
		expect(() => buildImportedRuns(broken)).toThrow(/t14\.load\.H\.c4\.sync-off/)
	})

	it('is refused: a different measurement window would not be the accepted protocol', () => {
		const original = sources()
		const load = original.t14.load.replaceAll('"windowS":10', '"windowS":12')

		expect(() => buildImportedRuns({ ...original, t14: { ...original.t14, load } })).toThrow(
			/window/,
		)
	})

	it('is refused: a correctness record that fails the bar cannot back a completed Run', () => {
		const original = sources()
		const failing = original.t14.correctness.replace('PASS nokey  S1', 'FAIL nokey  S1')
		const correctness = `${failing}   - S1: final Balance 5, expected 0\n`

		expect(() => buildImportedRuns({ ...original, t14: { ...original.t14, correctness } })).toThrow(
			/correctness/i,
		)
	})
})
