import { join } from 'node:path'
import type { BenchDatabase } from '../../bench/lib/database'
import { prepareBenchmarkDatabase } from '../../bench/lib/preflight'
import { T13_PROTOCOL } from '../../bench/scenarios/measure'
import { T13_QUERIES } from '../../bench/scenarios/t13-queries'
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

/**
 * The complete Benchmark Suite known by this source revision. Groups are registered here in
 * execution order: the dataset gate first (`prepare`), then T13 reads; the T14 matrix (B4) follows.
 */
export function buildSuite(database: BenchDatabase): BenchmarkSuite {
	return {
		scenarios: t13Scenarios(),
		prepare: () => prepareBenchmarkDatabase(database),
	}
}
