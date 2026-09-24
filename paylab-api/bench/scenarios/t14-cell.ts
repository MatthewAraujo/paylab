import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Pool } from 'pg'
import type { BenchmarkMetric } from '../../src/domain/benchmark/summary'
import { runLoadBlock } from '../exp/strategies/load-run'
import { STRATEGIES } from '../exp/strategies/strategies'
import { type BenchDatabase, assertBenchDatabaseUrl } from '../lib/database'
import { restoreBenchmarkDatabase } from '../lib/reset'
import { discoverTargets } from '../lib/targets'
import {
	type CellDef,
	type LoadLine,
	type Shape,
	type SyncMode,
	cellMetrics,
	strategyOrder,
} from './t14-matrix'

export interface CellProtocol {
	warmupMs: number
	durationMs: number
	repetitions: number
}

export interface CellResult {
	metrics: BenchmarkMetric[]
	/** Every driver line of every repetition and strategy: the raw samples. */
	lines: LoadLine[]
}

/**
 * One cell of the matrix. Each repetition is a block: the database is restored from the
 * template (deterministic, isolated from every earlier block), then the five strategies run in
 * the rotated order for that repetition on the same database, as in the accepted experiment.
 */
export async function runCell(
	cell: CellDef,
	options: { database: BenchDatabase; protocol: CellProtocol; log?: (message: string) => void },
): Promise<CellResult> {
	const { database, protocol } = options
	const log = options.log ?? (() => {})
	const lines: LoadLine[] = []

	for (let rep = 1; rep <= protocol.repetitions; rep++) {
		const order = strategyOrder(cell.index, rep)
		log(`block rep=${rep}/${protocol.repetitions} order=${order.join(',')}: restoring the database`)
		await restoreBenchmarkDatabase(database)

		const pool = new Pool({ connectionString: database.url, max: 1 })
		let hotWalletId: string
		try {
			hotWalletId = (await discoverTargets(pool)).hotWallet
		} finally {
			await pool.end()
		}

		lines.push(
			...(await runLoadBlock({
				shape: cell.shape,
				clients: cell.clients,
				strategies: order,
				durationS: protocol.durationMs / 1000,
				warmupS: protocol.warmupMs / 1000,
				sync: cell.sync,
				rep,
				url: database.url,
				hotWalletId,
				onLine: (line) => log(`  ${line.strategy}: ${line.tps} tx/s, p99 ${line.p99} ms`),
			})),
		)
	}

	const metrics = STRATEGIES.flatMap((strategy) =>
		cellMetrics(
			strategy,
			cell.shape,
			lines.filter((line) => line.strategy === strategy),
		),
	)
	return { metrics, lines }
}

function flag(name: string): string {
	const at = process.argv.indexOf(`--${name}`)
	if (at < 0 || process.argv[at + 1] === undefined) {
		throw new Error(`Missing --${name}`)
	}
	return process.argv[at + 1]
}
const numberFlag = (name: string) => {
	const value = Number(flag(name))
	if (!Number.isFinite(value)) throw new Error(`Invalid --${name}`)
	return value
}

// Process entry: `t14-cell.ts <cell id> --shape H|W|M --clients N --sync on|off --index N
// --warmup-ms N --duration-ms N --repetitions N`. The registry passes the whole definition, so the
// process never depends on a lookup table.
async function main() {
	const cell: CellDef = {
		id: process.argv[2],
		shape: flag('shape') as Shape,
		clients: numberFlag('clients'),
		sync: flag('sync') as SyncMode,
		index: numberFlag('index'),
	}
	const database = assertBenchDatabaseUrl(process.env.BENCH_DATABASE_URL, {
		templateName: process.env.BENCH_TEMPLATE_DATABASE,
		forbiddenUrls: [process.env.DATABASE_URL],
	})

	const result = await runCell(cell, {
		database,
		protocol: {
			warmupMs: numberFlag('warmup-ms'),
			durationMs: numberFlag('duration-ms'),
			repetitions: numberFlag('repetitions'),
		},
		log: (message) => console.log(message),
	})

	const directory = process.env.BENCH_ARTIFACT_DIR
	if (directory) {
		mkdirSync(directory, { recursive: true })
		writeFileSync(
			join(directory, 'samples.jsonl'),
			`${result.lines.map((line) => JSON.stringify(line)).join('\n')}\n`,
		)
	}
	console.log(`BENCH_RESULT ${JSON.stringify(result.metrics)}`)
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exit(1)
	})
}
