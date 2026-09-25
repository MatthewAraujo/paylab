import type { BenchmarkMetric } from '../../src/domain/benchmark/summary'
import { MAX_ATTEMPTS, STRATEGIES, type Strategy } from '../exp/strategies/strategies'
import { median } from './measure'

// The T14 concurrency-strategy experiment as registered scenarios. One scenario is one cell of
// the matrix (shape, clients, commit mode); the strategy is a dimension of its metrics. A cell
// runs three repetitions; each repetition restores the benchmark database and then runs the five
// strategies in a rotated (Latin-square) order on the same database, exactly as the accepted
// `run-matrix.sh` did.

export type Shape = 'H' | 'W' | 'M'
export type SyncMode = 'on' | 'off'

export const T14_PROTOCOL = {
	warmupMs: 2000,
	durationMs: 10000,
	repetitions: 3,
	aggregation: 'median',
} as const

/** The workload constants the fingerprint must cover: change one and the cell is not comparable. */
export const T14_WORKLOAD = {
	amountCentavos: 100,
	batchSize: 50,
	fundCentavos: 100_000_000,
	maxAttempts: MAX_ATTEMPTS,
} as const

/** The strategy that ADR 0002 and ADR 0010 chose; its headline metrics feed the overview. */
export const PRODUCTION_STRATEGY: Strategy = 'nokey'

export interface CellDef {
	id: string
	shape: Shape
	clients: number
	sync: SyncMode
	/** Position in the accepted sweep (commit mode off first); drives the rotation. */
	index: number
}

const CELL_SHAPES: [Shape, number][] = [
	['H', 4],
	['H', 16],
	['H', 64],
	['W', 16],
	['W', 64],
	['M', 4],
	['M', 16],
	['M', 64],
]

export const T14_CELLS: CellDef[] = (['off', 'on'] as const).flatMap((sync, half) =>
	CELL_SHAPES.map(([shape, clients], i) => ({
		id: `t14.load.${shape}.c${clients}.sync-${sync}`,
		shape,
		clients,
		sync,
		index: half * CELL_SHAPES.length + i,
	})),
)

export const cellTitle = (cell: Pick<CellDef, 'shape' | 'clients' | 'sync'>) =>
	`Concurrency strategies: shape ${cell.shape}, ${cell.clients} clients, synchronous_commit=${cell.sync}`

/** Latin-square rotation: the first strategy of a block differs in every repetition. */
export function strategyOrder(cellIndex: number, rep: number): Strategy[] {
	return STRATEGIES.map((_, i) => STRATEGIES[(i + cellIndex + rep) % STRATEGIES.length])
}

/** One JSON line of the load driver: one strategy, one repetition, one measurement window. */
export interface LoadLine {
	shape: Shape
	clients: number
	strategy: Strategy
	rep: number
	sync: SyncMode
	windowS: number
	tps: number
	debitTps: number
	creditTps: number
	p50: number
	p95: number
	p99: number
	debitP50: number
	debitP95: number
	debitP99: number
	creditP50: number
	creditP95: number
	creditP99: number
	attemptsPerSuccess: number
	serializationFailures: number
	versionConflicts: number
	deadlocks: number
	exhausted: number
	errors: number
	failedPayments: number
	acquireMeanMs: number
	acquireP95Ms: number
	avgLockWaiters: number
	pgRollbacks: number | null
	pgDeadlocks: number | null
	samples: number
}

export interface Aggregate {
	median: number
	min: number
	max: number
}

type NumericField = Exclude<keyof LoadLine, 'shape' | 'strategy' | 'sync'>

/** Median and range of every field over the repetitions; a field never recorded stays absent. */
export function aggregateRuns(lines: LoadLine[]): Record<string, Aggregate> {
	const result: Record<string, Aggregate> = {}
	const fields = new Set(lines.flatMap((line) => Object.keys(line))) as Set<string>
	for (const field of fields) {
		const values = lines
			.map((line) => line[field as NumericField])
			.filter((value): value is number => typeof value === 'number')
		if (values.length > 0) {
			result[field] = { median: median(values), min: Math.min(...values), max: Math.max(...values) }
		}
	}
	return result
}

interface FieldSpec {
	field: NumericField
	key: string
	label: string
	unit: string
	direction: BenchmarkMetric['direction']
	/** Shapes that have this measurement; elsewhere it is absent, never zero. */
	shapes?: Shape[]
	role?: NonNullable<BenchmarkMetric['summaryRole']>
}

const HIGHER = 'HIGHER_IS_BETTER'
const LOWER = 'LOWER_IS_BETTER'
const MIXED: Shape[] = ['M']

const FIELDS: FieldSpec[] = [
	{
		field: 'tps',
		key: 'tps',
		label: 'Settlements per second',
		unit: 'tx/s',
		direction: HIGHER,
		role: 'THROUGHPUT',
	},
	{
		field: 'debitTps',
		key: 'debit_tps',
		label: 'Debit settlements per second',
		unit: 'tx/s',
		direction: HIGHER,
		shapes: MIXED,
	},
	{
		field: 'creditTps',
		key: 'credit_tps',
		label: 'Credit settlements per second',
		unit: 'tx/s',
		direction: HIGHER,
		shapes: MIXED,
	},
	{ field: 'p50', key: 'latency_p50_ms', label: 'Latency p50', unit: 'ms', direction: LOWER },
	{ field: 'p95', key: 'latency_p95_ms', label: 'Latency p95', unit: 'ms', direction: LOWER },
	{
		field: 'p99',
		key: 'latency_p99_ms',
		label: 'Latency p99',
		unit: 'ms',
		direction: LOWER,
		role: 'LATENCY_P99',
	},
	{
		field: 'debitP50',
		key: 'debit_latency_p50_ms',
		label: 'Debit latency p50',
		unit: 'ms',
		direction: LOWER,
		shapes: MIXED,
	},
	{
		field: 'debitP95',
		key: 'debit_latency_p95_ms',
		label: 'Debit latency p95',
		unit: 'ms',
		direction: LOWER,
		shapes: MIXED,
	},
	{
		field: 'debitP99',
		key: 'debit_latency_p99_ms',
		label: 'Debit latency p99',
		unit: 'ms',
		direction: LOWER,
		shapes: MIXED,
	},
	{
		field: 'creditP50',
		key: 'credit_latency_p50_ms',
		label: 'Credit latency p50',
		unit: 'ms',
		direction: LOWER,
		shapes: MIXED,
	},
	{
		field: 'creditP95',
		key: 'credit_latency_p95_ms',
		label: 'Credit latency p95',
		unit: 'ms',
		direction: LOWER,
		shapes: MIXED,
	},
	{
		field: 'creditP99',
		key: 'credit_latency_p99_ms',
		label: 'Credit latency p99',
		unit: 'ms',
		direction: LOWER,
		shapes: MIXED,
	},
	{
		field: 'attemptsPerSuccess',
		key: 'attempts_per_success',
		label: 'Attempts per success',
		unit: 'attempts',
		direction: LOWER,
	},
	{
		field: 'serializationFailures',
		key: 'serialization_failures',
		label: 'Serialization failures',
		unit: 'count',
		direction: LOWER,
	},
	{
		field: 'versionConflicts',
		key: 'version_conflicts',
		label: 'Version conflicts',
		unit: 'count',
		direction: LOWER,
	},
	{
		field: 'deadlocks',
		key: 'deadlocks',
		label: 'Deadlocks (client-observed)',
		unit: 'count',
		direction: LOWER,
	},
	{
		field: 'exhausted',
		key: 'exhausted_operations',
		label: 'Operations that exhausted their retries',
		unit: 'count',
		direction: LOWER,
	},
	{ field: 'errors', key: 'errors', label: 'Errored operations', unit: 'count', direction: LOWER },
	{
		field: 'failedPayments',
		key: 'failed_payments',
		label: 'Payments failed for insufficient funds',
		unit: 'count',
		direction: LOWER,
	},
	{
		field: 'acquireMeanMs',
		key: 'lock_acquire_mean_ms',
		label: 'Lock acquisition, mean',
		unit: 'ms',
		direction: LOWER,
	},
	{
		field: 'acquireP95Ms',
		key: 'lock_acquire_p95_ms',
		label: 'Lock acquisition, p95',
		unit: 'ms',
		direction: LOWER,
	},
	{
		field: 'avgLockWaiters',
		key: 'lock_waiters_avg',
		label: 'Sessions waiting on a lock, average',
		unit: 'sessions',
		direction: LOWER,
	},
	{
		field: 'pgRollbacks',
		key: 'pg_rollbacks',
		label: 'PostgreSQL rollbacks',
		unit: 'count',
		direction: LOWER,
	},
	{
		field: 'pgDeadlocks',
		key: 'pg_deadlocks',
		label: 'PostgreSQL deadlocks',
		unit: 'count',
		direction: LOWER,
	},
	{
		field: 'samples',
		key: 'lock_samples',
		label: 'Lock-waiter samples taken',
		unit: 'count',
		direction: 'NEUTRAL',
	},
]

/**
 * The normalized metrics of one strategy in one cell: the median over the repetitions of every
 * measured field, plus the throughput range. Only the production strategy carries the headline
 * roles, so the overview never has to guess which of five strategies to feature.
 */
export function cellMetrics(
	strategy: Strategy,
	shape: Shape,
	lines: LoadLine[],
): BenchmarkMetric[] {
	const aggregate = aggregateRuns(lines)
	const dimensions = { strategy }
	const metrics: BenchmarkMetric[] = []

	for (const spec of FIELDS) {
		const values = aggregate[spec.field]
		if (!values || (spec.shapes && !spec.shapes.includes(shape))) {
			continue
		}
		metrics.push({
			key: spec.key,
			label: spec.label,
			unit: spec.unit,
			direction: spec.direction,
			aggregation: 'median',
			dimensions,
			value: values.median,
			...(spec.role && strategy === PRODUCTION_STRATEGY ? { summaryRole: spec.role } : {}),
		})
	}

	if (aggregate.tps) {
		for (const [key, label, aggregation, value] of [
			['tps_min', 'Settlements per second, lowest repetition', 'min', aggregate.tps.min],
			['tps_max', 'Settlements per second, highest repetition', 'max', aggregate.tps.max],
		] as const) {
			metrics.push({ key, label, unit: 'tx/s', direction: HIGHER, aggregation, dimensions, value })
		}
	}
	return metrics
}
