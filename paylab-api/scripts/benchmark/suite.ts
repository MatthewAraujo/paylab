import { join } from 'node:path'
import { STRATEGIES, type Strategy } from '../../bench/exp/strategies/strategies'
import type { BenchDatabase } from '../../bench/lib/database'
import { prepareBenchmarkDatabase } from '../../bench/lib/preflight'
import { restoreBenchmarkDatabase } from '../../bench/lib/reset'
import { T13_PROTOCOL } from '../../bench/scenarios/measure'
import { T13_QUERIES } from '../../bench/scenarios/t13-queries'
import {
	type CellDef,
	T14_CELLS,
	T14_PROTOCOL,
	T14_WORKLOAD,
	cellTitle,
} from '../../bench/scenarios/t14-matrix'
import type { BenchmarkSuite, ScenarioSpec } from './executor'

const API_ROOT = join(__dirname, '..', '..')

// Every scenario is its own short-lived process, so a crash or a hang in one query can never
// take the Run with it, and its output becomes that scenario's log.
const nodeScript = (script: string, ...args: string[]) => [
	'-r',
	'ts-node/register/transpile-only',
	'-r',
	'tsconfig-paths/register',
	script,
	...args,
]

/** T13: the documented reads and the pagination-depth experiment, one scenario per query. */
export function t13Scenarios(): ScenarioSpec[] {
	return T13_QUERIES.map((query) => ({
		definition: {
			id: query.id,
			group: 't13',
			title: query.title,
			protocol: T13_PROTOCOL,
			config: query.config,
		},
		command: process.execPath,
		args: nodeScript('bench/scenarios/t13-reads.ts', query.id),
		cwd: API_ROOT,
	}))
}

export interface T14Options {
	/** Reduced matrices exist only for automated tests; the registered suite uses the defaults. */
	cells?: CellDef[]
	protocol?: { warmupMs: number; durationMs: number; repetitions: number }
	gateStrategies?: Strategy[]
}

/**
 * T14: the correctness gate, then one scenario per cell of the matrix. The gate mutates the
 * database, so it starts from a restored one; each cell restores the database itself, once per
 * repetition, because the rotation only works from a known state.
 */
export function t14Scenarios(database: BenchDatabase, options: T14Options = {}): ScenarioSpec[] {
	const protocol = options.protocol ?? T14_PROTOCOL
	const gateStrategies = options.gateStrategies ?? [...STRATEGIES]

	const gate: ScenarioSpec = {
		definition: {
			id: 't14.correctness',
			group: 't14',
			title: 'Concurrency correctness gate (T10 scenarios against every strategy)',
			protocol: { repetitions: 1, aggregation: 'sum' },
			config: {
				scenarios: ['S1', 'S2', 'S3', 'S4'],
				strategies: gateStrategies,
				knownFinding: 'forupdate deadlocks on crossed transfers (ADR 0010)',
			},
		},
		command: process.execPath,
		args: nodeScript('bench/scenarios/t14-correctness.ts', gateStrategies.join(',')),
		cwd: API_ROOT,
		prepare: () => restoreBenchmarkDatabase(database),
	}

	const cells = (options.cells ?? T14_CELLS).map(
		(cell): ScenarioSpec => ({
			definition: {
				id: cell.id,
				group: 't14',
				title: cellTitle(cell),
				protocol: { ...protocol, aggregation: 'median' },
				config: {
					shape: cell.shape,
					clients: cell.clients,
					sync: cell.sync,
					cellIndex: cell.index,
					strategies: [...STRATEGIES],
					rotation: 'latin-square',
					blockReset: 'template',
					workload: { ...T14_WORKLOAD },
				},
			},
			command: process.execPath,
			args: nodeScript(
				'bench/scenarios/t14-cell.ts',
				cell.id,
				...['--shape', cell.shape, '--clients', String(cell.clients)],
				...['--sync', cell.sync, '--index', String(cell.index)],
				...['--warmup-ms', String(protocol.warmupMs)],
				...['--duration-ms', String(protocol.durationMs)],
				...['--repetitions', String(protocol.repetitions)],
			),
			cwd: API_ROOT,
		}),
	)
	return [gate, ...cells]
}

/**
 * The complete Benchmark Suite known by this source revision. Groups are registered here in
 * execution order: the dataset gate first (`prepare`), then the T13 reads, then the T14 correctness
 * gate and matrix.
 */
export function buildSuite(database: BenchDatabase): BenchmarkSuite {
	return {
		scenarios: [...t13Scenarios(), ...t14Scenarios(database)],
		prepare: () => prepareBenchmarkDatabase(database),
	}
}
