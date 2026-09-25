import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'
import type { BenchmarkMetric } from '../../src/domain/benchmark/summary'
import { assertBenchDatabaseUrl } from '../lib/database'
import { type Targets, discoverTargets } from '../lib/targets'
import { type ReadProtocol, T13_PROTOCOL, measureQuery } from './measure'
import { type ReadQueryDef, T13_QUERIES, render } from './t13-queries'

export interface ReadScenarioResult {
	metrics: BenchmarkMetric[]
	plan: string
	sql: string
}

const latency = (
	key: string,
	label: string,
	aggregation: string,
	value: number,
): BenchmarkMetric => ({
	key,
	label,
	unit: 'ms',
	direction: 'LOWER_IS_BETTER',
	aggregation,
	value,
})

/**
 * Runs one registered read query under the T13 protocol: EXPLAIN (ANALYZE, BUFFERS) with a
 * custom plan (the planner sees the real values), one discarded warm-up, seven measured runs.
 */
export async function runReadScenario(
	def: ReadQueryDef,
	pool: Pool,
	protocol: ReadProtocol = T13_PROTOCOL,
	knownTargets?: Targets,
): Promise<ReadScenarioResult> {
	const targets = knownTargets ?? (await discoverTargets(pool))
	const sql = render(def.template, await def.resolve({ pool, targets }))

	const client = await pool.connect()
	try {
		await client.query('SET plan_cache_mode = force_custom_plan')
		const execute = async (statement: string) => {
			const { rows } = await client.query(`EXPLAIN (ANALYZE, BUFFERS) ${statement}`)
			return rows.map((row) => row['QUERY PLAN']).join('\n')
		}
		const measured = await measureQuery(execute, sql, protocol)
		return {
			sql,
			plan: measured.plan,
			metrics: [
				latency('query_latency_median_ms', 'Query latency (median)', 'median', measured.medianMs),
				latency('query_latency_min_ms', 'Query latency (minimum)', 'min', measured.minMs),
				latency('query_latency_max_ms', 'Query latency (maximum)', 'max', measured.maxMs),
			],
		}
	} finally {
		client.release()
	}
}

// Process entry point: `t13-reads.ts <scenario id>`. Prints the BENCH_RESULT line the executor
// reads and leaves the plan of the last measured run in BENCH_ARTIFACT_DIR.
async function main() {
	const scenarioId = process.argv[2]
	const def = T13_QUERIES.find((query) => query.id === scenarioId)
	if (!def) {
		throw new Error(`Unknown T13 scenario "${scenarioId}"`)
	}
	const database = assertBenchDatabaseUrl(process.env.BENCH_DATABASE_URL, {
		forbiddenUrls: [process.env.DATABASE_URL],
	})

	const pool = new Pool({ connectionString: database.url, max: 2 })
	try {
		const result = await runReadScenario(def, pool)
		const directory = process.env.BENCH_ARTIFACT_DIR
		if (directory) {
			mkdirSync(directory, { recursive: true })
			writeFileSync(
				join(directory, 'plan.plan.txt'),
				`-- ${def.title}\n-- ${result.sql}\n${result.plan}\n`,
			)
		}
		console.log(`BENCH_RESULT ${JSON.stringify(result.metrics)}`)
	} finally {
		await pool.end()
	}
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exit(1)
	})
}
