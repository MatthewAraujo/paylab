import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { BenchmarkMetric } from '../../src/domain/benchmark/summary'
import { type CorrectnessResult, runCorrectness } from '../exp/strategies/correctness'
import { STRATEGIES, type Strategy } from '../exp/strategies/strategies'
import { assertBenchDatabaseUrl } from '../lib/database'

// The T14 correctness bar, run before any timing. All five strategies face the T10 concurrency
// scenarios; the result is a gate: if it fails, the Run is incomplete.
//
// Expected outcome (docs/experiments/raw/T14-correctness.txt, ADR 0010): four strategies pass.
// FOR UPDATE deadlocks on crossed transfers: that is a finding about the alternative, not a
// correctness regression, so deadlocks in that one scenario are tolerated for that one strategy.
// Any other failure, or any global invariant violation, fails the gate.

const KNOWN_FINDING: Partial<Record<Strategy, RegExp>> = { forupdate: /^S3: \d+ deadlocks$/ }

export interface GateOutcome {
	ok: boolean
	problems: string[]
}

const unexpectedFailures = (result: CorrectnessResult) =>
	result.failures.filter((failure) => !KNOWN_FINDING[result.strategy]?.test(failure))

export function evaluateGate(results: CorrectnessResult[]): GateOutcome {
	const problems = results.flatMap((result) =>
		unexpectedFailures(result).map((failure) => `${result.strategy}: ${failure}`),
	)
	return { ok: problems.length === 0, problems }
}

export function correctnessMetrics(results: CorrectnessResult[]): BenchmarkMetric[] {
	return results.flatMap((result) => {
		const dimensions = { strategy: result.strategy }
		const metric = (key: string, label: string, value: number): BenchmarkMetric => ({
			key,
			label,
			unit: 'count',
			direction: 'LOWER_IS_BETTER',
			aggregation: 'sum',
			dimensions,
			value,
		})
		return [
			metric('correctness_violations', 'Correctness violations', unexpectedFailures(result).length),
			metric('crossed_transfer_deadlocks', 'Deadlocks on crossed transfers', result.deadlocks),
			metric('correctness_retries', 'Retried attempts', result.retries),
		]
	})
}

// Process entry: `t14-correctness.ts [strategy,strategy,...]`. Exit code 1 fails the gate.
async function main() {
	const chosen = (process.argv[2]?.split(',') ?? [...STRATEGIES]) as Strategy[]
	const database = assertBenchDatabaseUrl(process.env.BENCH_DATABASE_URL, {
		forbiddenUrls: [process.env.DATABASE_URL],
	})

	const results = await runCorrectness(chosen, { url: database.url })
	for (const { strategy, failures, notes } of results) {
		console.log(`${failures.length === 0 ? 'PASS' : 'FAIL'} ${strategy}  ${notes.join('  ')}`)
		for (const failure of failures.slice(0, 12)) console.log(`   - ${failure}`)
	}

	const directory = process.env.BENCH_ARTIFACT_DIR
	if (directory) {
		mkdirSync(directory, { recursive: true })
		writeFileSync(
			join(directory, 'correctness.jsonl'),
			`${results.map((result) => JSON.stringify(result)).join('\n')}\n`,
		)
	}

	const gate = evaluateGate(results)
	if (!gate.ok) {
		console.error(`Correctness gate failed: ${gate.problems.join('; ')}`)
		process.exit(1)
	}
	console.log(`BENCH_RESULT ${JSON.stringify(correctnessMetrics(results))}`)
}

if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
	main().catch((error) => {
		console.error(error instanceof Error ? error.message : error)
		process.exit(2)
	})
}
