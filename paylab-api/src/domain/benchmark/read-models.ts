import { canonicalJson } from './canonical'
import type { BenchmarkMetric, BenchmarkSummary } from './summary'

// Views of Benchmark Summaries for the read API: light enough to list, focused enough to poll.

export interface HeadlineMetric {
	scenarioId: string
	key: string
	label: string
	unit: string
	value: number
	summaryRole: NonNullable<BenchmarkMetric['summaryRole']>
	dimensions?: Record<string, string>
}

export interface RunListItem {
	runId: string
	kind: BenchmarkSummary['kind']
	status: BenchmarkSummary['status']
	note?: string
	source: BenchmarkSummary['source']
	startedAt: string
	finishedAt?: string
	durationMs?: number
	dataset: BenchmarkSummary['dataset']
	environmentFingerprint: string
	scenarioCounts: {
		total: number
		pending: number
		active: number
		completed: number
		failed: number
	}
	/** Only the measurements a scenario explicitly featured (a summary role). */
	headlineMetrics: HeadlineMetric[]
	failure?: { scenarioId?: string; summary: string }
}

export function toRunListItem(summary: BenchmarkSummary): RunListItem {
	const count = (status: BenchmarkSummary['scenarios'][number]['status']) =>
		summary.scenarios.filter((scenario) => scenario.status === status).length

	return {
		runId: summary.runId,
		kind: summary.kind,
		status: summary.status,
		note: summary.note,
		source: summary.source,
		startedAt: summary.startedAt,
		finishedAt: summary.finishedAt,
		durationMs: summary.durationMs,
		dataset: summary.dataset,
		environmentFingerprint: summary.environment.fingerprint,
		scenarioCounts: {
			total: summary.scenarios.length,
			pending: count('PENDING'),
			active: count('ACTIVE'),
			completed: count('COMPLETED'),
			failed: count('FAILED'),
		},
		headlineMetrics: summary.scenarios.flatMap((scenario) =>
			scenario.metrics.flatMap((metric) =>
				metric.summaryRole
					? [
							{
								scenarioId: scenario.id,
								key: metric.key,
								label: metric.label,
								unit: metric.unit,
								value: metric.value,
								summaryRole: metric.summaryRole,
								dimensions: metric.dimensions,
							},
						]
					: [],
			),
		),
		failure: summary.failure && {
			scenarioId: summary.failure.scenarioId,
			summary: summary.failure.summary,
		},
	}
}

export interface RunProgress {
	runId: string
	status: BenchmarkSummary['status']
	/** The scenario running right now, or null when nothing is. */
	current: string | null
	completed: number
	total: number
	scenarios: {
		id: string
		group: string
		title: string
		status: BenchmarkSummary['scenarios'][number]['status']
		startedAt?: string
		finishedAt?: string
		durationMs?: number
	}[]
	failure?: { scenarioId?: string; summary: string }
}

export function toProgress(summary: BenchmarkSummary): RunProgress {
	return {
		runId: summary.runId,
		status: summary.status,
		current: summary.scenarios.find((scenario) => scenario.status === 'ACTIVE')?.id ?? null,
		completed: summary.scenarios.filter((scenario) => scenario.status === 'COMPLETED').length,
		total: summary.scenarios.length,
		scenarios: summary.scenarios.map((scenario) => ({
			id: scenario.id,
			group: scenario.group,
			title: scenario.title,
			status: scenario.status,
			startedAt: scenario.startedAt,
			finishedAt: scenario.finishedAt,
			durationMs: scenario.durationMs,
		})),
		failure: summary.failure && {
			scenarioId: summary.failure.scenarioId,
			summary: summary.failure.summary,
		},
	}
}

export type TrendExclusion =
	| 'changed'
	| 'environment-incompatible'
	| 'dataset-incompatible'
	| 'metric-not-recorded'

export interface TrendQuery {
	scenarioId: string
	metricKey: string
	dimensions: Record<string, string>
}

export interface Trend {
	scenarioId: string
	metricKey: string
	dimensions: Record<string, string>
	label: string | null
	unit: string | null
	direction: BenchmarkMetric['direction'] | null
	/** The newest completed Run that has the scenario: the line is drawn against its definition. */
	reference: { runId: string; startedAt: string } | null
	points: { runId: string; startedAt: string; kind: BenchmarkSummary['kind']; value: number }[]
	excluded: { runId: string; startedAt: string; reason: TrendExclusion }[]
	/** Incomplete Runs: visible on the timeline, never with a value. */
	incompleteRuns: { runId: string; startedAt: string; failureSummary?: string }[]
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)
const chronological = (a: BenchmarkSummary, b: BenchmarkSummary) =>
	compareText(a.startedAt, b.startedAt) || compareText(a.runId, b.runId)

const sameDimensions = (a: Record<string, string> | undefined, b: Record<string, string>) =>
	canonicalJson(a ?? {}) === canonicalJson(b)

/**
 * One metric of one scenario across Runs, limited to what is comparable with the newest
 * completed measurement: same scenario definition, environment, and dataset. Anything else is
 * listed with its reason rather than joined into the line.
 */
export function buildTrend(runs: BenchmarkSummary[], query: TrendQuery): Trend {
	const ordered = [...runs].sort(chronological)
	const completed = ordered.filter((run) => run.status === 'COMPLETED')
	const withScenario = completed.filter((run) =>
		run.scenarios.some((s) => s.id === query.scenarioId),
	)
	const newest = withScenario.at(-1)

	const trend: Trend = {
		scenarioId: query.scenarioId,
		metricKey: query.metricKey,
		dimensions: query.dimensions,
		label: null,
		unit: null,
		direction: null,
		reference: newest ? { runId: newest.runId, startedAt: newest.startedAt } : null,
		points: [],
		excluded: [],
		incompleteRuns: ordered
			.filter((run) => run.status === 'INCOMPLETE')
			.map((run) => ({
				runId: run.runId,
				startedAt: run.startedAt,
				failureSummary: run.failure?.summary,
			})),
	}
	if (!newest) {
		return trend
	}

	const scenarioOf = (run: BenchmarkSummary) => run.scenarios.find((s) => s.id === query.scenarioId)
	const referenceScenario = scenarioOf(newest)

	for (const run of withScenario) {
		const scenario = scenarioOf(run)
		const base = { runId: run.runId, startedAt: run.startedAt }
		let reason: TrendExclusion | null = null
		if (run.environment.fingerprint !== newest.environment.fingerprint) {
			reason = 'environment-incompatible'
		} else if (run.dataset.fingerprint !== newest.dataset.fingerprint) {
			reason = 'dataset-incompatible'
		} else if (scenario?.fingerprint !== referenceScenario?.fingerprint) {
			reason = 'changed'
		}
		if (reason) {
			trend.excluded.push({ ...base, reason })
			continue
		}

		const metric = scenario?.metrics.find(
			(m) => m.key === query.metricKey && sameDimensions(m.dimensions, query.dimensions),
		)
		if (!metric) {
			trend.excluded.push({ ...base, reason: 'metric-not-recorded' })
			continue
		}
		trend.label ??= metric.label
		trend.unit ??= metric.unit
		trend.direction ??= metric.direction
		trend.points.push({ ...base, kind: run.kind, value: metric.value })
	}
	return trend
}
