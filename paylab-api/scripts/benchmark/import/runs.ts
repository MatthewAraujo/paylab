import { fingerprint, scenarioFingerprint } from '@/domain/benchmark/canonical'
import {
	type BenchmarkMetric,
	type BenchmarkScenario,
	type BenchmarkSummary,
	parseSummary,
} from '@/domain/benchmark/summary'
import { STRATEGIES } from '../../../bench/exp/strategies/strategies'
import { T13_PROTOCOL } from '../../../bench/scenarios/measure'
import { T13_QUERIES } from '../../../bench/scenarios/t13-queries'
import { correctnessMetrics, evaluateGate } from '../../../bench/scenarios/t14-correctness'
import {
	type LoadLine,
	T14_CELLS,
	T14_PROTOCOL,
	cellMetrics,
	cellTitle,
} from '../../../bench/scenarios/t14-matrix'
import { DATASET, EVIDENCE, IMPORTED_AT, NOTES, T13_ENVIRONMENT, T14_ENVIRONMENT } from './manifest'
import type { LegacySources } from './read'
import {
	type DepthRow,
	ImportSourceError,
	type QueryRow,
	parseCorrectness,
	parseDepthTable,
	parseLoadLines,
	parseQueryTable,
} from './sources'

// Labels printed by the T13 suite helper, mapped onto the ids the native suite registers, so an
// imported Run and a native Run line up scenario by scenario.
const LABELS: [RegExp, (subject: string) => string][] = [
	[/^history first page \((\w+) wallet\)$/, (s) => `t13.history.first-page.${s}-wallet`],
	[/^history next page, mid \((\w+) wallet\)$/, (s) => `t13.history.next-page.${s}-wallet`],
	[/^balance \((\w+) wallet\)$/, (s) => `t13.balance.${s}-wallet`],
	[/^list first page \((\w+) merchant\)$/, (s) => `t13.payments.first-page.${s}-merchant`],
	[/^list next page, deep \((\w+) merchant\)$/, (s) => `t13.payments.next-page-deep.${s}-merchant`],
	[/^list status=CREATED \((\w+) merchant\)$/, (s) => `t13.payments.status-created.${s}-merchant`],
	[/^list status=FAILED \((\w+) merchant\)$/, (s) => `t13.payments.status-failed.${s}-merchant`],
	[
		/^list account filter, rare match \(cold merchant\)$/,
		() => 't13.payments.account-filter-rare.cold-merchant',
	],
	[/^list account filter \((\w+) merchant\)$/, (s) => `t13.payments.account-filter.${s}-merchant`],
	[/^list period 30d \((\w+) merchant\)$/, (s) => `t13.payments.period-30d.${s}-merchant`],
]

export function legacyLabelToId(label: string): string {
	for (const [pattern, toId] of LABELS) {
		const match = pattern.exec(label)
		if (match) return toId(match[1])
	}
	const report = /^report (30d|90d) \((\w+) merchant\)$/.exec(label)
	if (report) return `t13.report.${report[1]}.${report[2]}-merchant`
	throw new ImportSourceError('T13 table', `unknown query label "${label}"`)
}

const NATIVE_T13 = new Map(T13_QUERIES.map((query, index) => [query.id, { query, index }]))

function t13Scenario(id: string, medianMs: number, legacyLabel: string) {
	const native = NATIVE_T13.get(id)
	if (!native) {
		throw new ImportSourceError(
			'T13 table',
			`"${legacyLabel}" maps to ${id}, which the suite does not register`,
		)
	}
	const protocol = { ...T13_PROTOCOL }
	// The schema state (which indexes exist) is the change under test, so it is not part of the
	// workload definition; the Run's note records it.
	const config = { origin: 'imported', legacyLabel }
	const metric: BenchmarkMetric = {
		key: 'query_latency_median_ms',
		label: 'Query latency (median)',
		unit: 'ms',
		direction: 'LOWER_IS_BETTER',
		aggregation: 'median',
		value: medianMs,
	}
	const scenario: BenchmarkScenario = {
		id,
		group: 't13',
		title: native.query.title,
		fingerprint: scenarioFingerprint({ id, protocol, config }),
		protocol,
		config,
		status: 'COMPLETED',
		metrics: [metric],
	}
	return { scenario, index: native.index }
}

function t13Scenarios(queries: QueryRow[], depth: DepthRow[]): BenchmarkScenario[] {
	const found = [
		...queries.map((row) => t13Scenario(legacyLabelToId(row.label), row.medianMs, row.label)),
		...depth.flatMap((row) => [
			t13Scenario(`t13.depth.keyset.${row.depth}`, row.keysetMs, `depth ${row.depth}, keyset`),
			t13Scenario(`t13.depth.offset.${row.depth}`, row.offsetMs, `depth ${row.depth}, offset`),
		]),
	]
	const ids = found.map(({ scenario }) => scenario.id)
	const duplicate = ids.find((id, i) => ids.indexOf(id) !== i)
	if (duplicate) {
		throw new ImportSourceError('T13 table', `scenario ${duplicate} appears twice`)
	}
	return found.sort((a, b) => a.index - b.index).map(({ scenario }) => scenario)
}

function t14LoadScenarios(lines: LoadLine[], file: string): BenchmarkScenario[] {
	return T14_CELLS.map((cell) => {
		const own = lines.filter(
			(l) => l.shape === cell.shape && l.clients === cell.clients && l.sync === cell.sync,
		)
		for (const strategy of STRATEGIES) {
			for (const rep of [1, 2, 3]) {
				const count = own.filter((l) => l.strategy === strategy && l.rep === rep).length
				if (count !== 1) {
					throw new ImportSourceError(
						file,
						`${cell.id}: expected one line for ${strategy} repetition ${rep}, found ${count}`,
					)
				}
			}
		}
		if (own.some((l) => l.windowS * 1000 !== T14_PROTOCOL.durationMs)) {
			throw new ImportSourceError(
				file,
				`${cell.id}: a measurement window other than ${T14_PROTOCOL.durationMs / 1000} s is not the accepted protocol`,
			)
		}

		const protocol = { ...T14_PROTOCOL }
		const config = {
			origin: 'imported',
			shape: cell.shape,
			clients: cell.clients,
			sync: cell.sync,
			cellIndex: cell.index,
			strategies: [...STRATEGIES],
			rotation: 'latin-square',
		}
		return {
			id: cell.id,
			group: 't14',
			title: cellTitle(cell),
			fingerprint: scenarioFingerprint({ id: cell.id, protocol, config }),
			protocol,
			config,
			status: 'COMPLETED' as const,
			metrics: STRATEGIES.flatMap((strategy) =>
				cellMetrics(
					strategy,
					cell.shape,
					own.filter((l) => l.strategy === strategy),
				),
			),
		}
	})
}

function t14GateScenario(text: string, file: string): BenchmarkScenario {
	const record = parseCorrectness(text, file)
	const gate = evaluateGate(record.results)
	if (!gate.ok) {
		throw new ImportSourceError(
			file,
			`the recorded correctness bar failed: ${gate.problems.join('; ')}`,
		)
	}
	const protocol = { repetitions: 1, aggregation: 'sum' }
	const config = {
		origin: 'imported',
		scenarios: ['S1', 'S2', 'S3', 'S4'],
		strategies: [...STRATEGIES],
		knownFinding: 'forupdate deadlocks on crossed transfers (ADR 0010)',
	}
	return {
		id: 't14.correctness',
		group: 't14',
		title: 'Concurrency correctness gate (T10 scenarios against every strategy)',
		fingerprint: scenarioFingerprint({ id: 't14.correctness', protocol, config }),
		protocol,
		config,
		status: 'COMPLETED',
		durationMs: record.elapsedMs,
		metrics: correctnessMetrics(record.results),
	}
}

function run(input: {
	runId: string
	source: string
	startedAt: string
	note: string
	environment: Record<string, string>
	scenarios: BenchmarkScenario[]
	artifacts: {
		id: string
		kind: 'RAW_DATA' | 'QUERY_PLAN' | 'LOG'
		label: string
		legacyFile: string
	}[]
}): BenchmarkSummary {
	const parsed = parseSummary({
		schemaVersion: 1,
		runId: input.runId,
		kind: 'imported',
		status: 'COMPLETED',
		note: input.note,
		source: { commit: 'unknown', branch: 'unknown' },
		startedAt: input.startedAt,
		executor: { version: 'legacy-import-1' },
		environment: { fingerprint: fingerprint(input.environment), details: input.environment },
		dataset: DATASET,
		scenarios: input.scenarios,
		artifacts: input.artifacts,
		imported: { source: input.source },
	})
	if (parsed.isLeft()) {
		throw new ImportSourceError(input.runId, parsed.value.message)
	}
	return parsed.value
}

/** T13 (baseline, adopted) and T14 as three separate Imported Benchmark Runs, in that order. */
export function buildImportedRuns(sources: LegacySources): BenchmarkSummary[] {
	const t13 = (state: 'baseline' | 'adopted') => {
		const isBaseline = state === 'baseline'
		const files = isBaseline
			? [EVIDENCE.t13BaselineQueries, EVIDENCE.t13BaselineDepth]
			: [EVIDENCE.t13AdoptedQueries, EVIDENCE.t13AdoptedDepth]
		const plans = isBaseline
			? [EVIDENCE.t13BaselineQueryPlans, EVIDENCE.t13BaselineDepthPlans]
			: [EVIDENCE.t13AdoptedQueryPlans, EVIDENCE.t13AdoptedDepthPlans]
		const text = isBaseline ? sources.t13Baseline : sources.t13Adopted
		return run({
			runId: isBaseline ? 'imported-t13-step1-baseline' : 'imported-t13-step2-adopted',
			source: 'docs/experiments/T13-results.md',
			startedAt: IMPORTED_AT.t13,
			note: isBaseline ? NOTES.t13Baseline : NOTES.t13Adopted,
			environment: T13_ENVIRONMENT,
			scenarios: t13Scenarios(
				parseQueryTable(text.queries, files[0]),
				parseDepthTable(text.depth, files[1]),
			),
			artifacts: [
				{
					id: 'query-table',
					kind: 'RAW_DATA',
					label: `T13 query timings (${state})`,
					legacyFile: files[0],
				},
				{
					id: 'depth-table',
					kind: 'RAW_DATA',
					label: `T13 pagination depth timings (${state})`,
					legacyFile: files[1],
				},
				{
					id: 'query-plans',
					kind: 'QUERY_PLAN',
					label: `T13 query plans (${state})`,
					legacyFile: plans[0],
				},
				{
					id: 'depth-plans',
					kind: 'QUERY_PLAN',
					label: `T13 pagination depth plans (${state})`,
					legacyFile: plans[1],
				},
			],
		})
	}

	const t14 = run({
		runId: 'imported-t14-load-v2',
		source: 'docs/experiments/T14-results.md',
		startedAt: IMPORTED_AT.t14,
		note: NOTES.t14,
		environment: T14_ENVIRONMENT,
		scenarios: [
			t14GateScenario(sources.t14.correctness, EVIDENCE.t14Correctness),
			...t14LoadScenarios(parseLoadLines(sources.t14.load, EVIDENCE.t14Load), EVIDENCE.t14Load),
		],
		artifacts: [
			{
				id: 'load-samples',
				kind: 'RAW_DATA',
				label: 'T14 driver lines (every strategy and repetition)',
				legacyFile: EVIDENCE.t14Load,
			},
			{
				id: 'correctness-record',
				kind: 'LOG',
				label: 'T14 correctness record',
				legacyFile: EVIDENCE.t14Correctness,
			},
		],
	})

	return [t13('baseline'), t13('adopted'), t14]
}
