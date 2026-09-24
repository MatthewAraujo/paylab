export type ReadProtocol = {
	warmupRuns: number
	repetitions: number
	aggregation: 'median'
}

// T13 protocol (docs/experiments/T13-results.md): the first execution warms the cache and is
// discarded, then seven measured executions are aggregated by their median.
export const T13_PROTOCOL: ReadProtocol = { warmupRuns: 1, repetitions: 7, aggregation: 'median' }

export function median(values: number[]): number {
	if (values.length === 0) {
		throw new Error('Cannot take the median of no values')
	}
	const sorted = [...values].sort((a, b) => a - b)
	const middle = Math.floor(sorted.length / 2)
	return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function parseExecutionTimeMs(plan: string): number {
	const match = /Execution Time: ([\d.]+) ms/.exec(plan)
	if (!match) {
		throw new Error('The plan has no "Execution Time" line; was it run with EXPLAIN (ANALYZE)?')
	}
	return Number(match[1])
}

export interface QueryMeasurement {
	samplesMs: number[]
	medianMs: number
	minMs: number
	maxMs: number
	/** The plan of the last measured execution, kept as evidence. */
	plan: string
}

/** `execute` runs the statement under EXPLAIN (ANALYZE, BUFFERS) and returns the plan text. */
export async function measureQuery(
	execute: (sql: string) => Promise<string>,
	sql: string,
	protocol: ReadProtocol = T13_PROTOCOL,
): Promise<QueryMeasurement> {
	for (let i = 0; i < protocol.warmupRuns; i++) {
		await execute(sql)
	}
	const samplesMs: number[] = []
	let plan = ''
	for (let i = 0; i < protocol.repetitions; i++) {
		plan = await execute(sql)
		samplesMs.push(parseExecutionTimeMs(plan))
	}
	return {
		samplesMs,
		medianMs: median(samplesMs),
		minMs: Math.min(...samplesMs),
		maxMs: Math.max(...samplesMs),
		plan,
	}
}
