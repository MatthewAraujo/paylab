import { existsSync } from 'node:fs'
import { type BenchmarkSummary, parseSummary } from '@/domain/benchmark/summary'
import type { LockRecord } from './lock'
import { publishSummary, readState, removeState, summaryPath } from './store'

/**
 * Turns the RUNNING record left by a dead process into a terminal INCOMPLETE Summary. What
 * already completed is kept as diagnostic evidence; the scenario that was active is FAILED.
 * Returns the published file, or null when there was nothing to recover.
 */
export function recoverAbandonedRun(input: {
	artifactRoot: string
	summaryDir: string
	record: LockRecord | null
	now: () => Date
}): string | null {
	const { artifactRoot, summaryDir, record, now } = input
	if (!record?.runId) {
		return null
	}

	let state: BenchmarkSummary | null
	try {
		state = readState(artifactRoot, record.runId)
	} catch {
		return null
	}
	if (!state) {
		return null
	}
	if (existsSync(summaryPath(summaryDir, state.runId))) {
		// The process died after publishing but before cleaning up.
		removeState(artifactRoot, state.runId)
		return null
	}

	const finishedAt = now()
	const scenarios = state.scenarios.map((scenario) =>
		scenario.status === 'ACTIVE'
			? {
					...scenario,
					status: 'FAILED' as const,
					finishedAt: finishedAt.toISOString(),
					durationMs: scenario.startedAt
						? finishedAt.getTime() - new Date(scenario.startedAt).getTime()
						: undefined,
				}
			: scenario,
	)
	const interrupted = scenarios.find(
		(scenario, index) => state?.scenarios[index].status === 'ACTIVE',
	)

	const parsed = parseSummary({
		...state,
		scenarios,
		status: 'INCOMPLETE',
		finishedAt: finishedAt.toISOString(),
		durationMs: finishedAt.getTime() - new Date(state.startedAt).getTime(),
		failure: {
			scenarioId: interrupted?.id,
			summary: `Interrupted: the process that owned this Run (pid ${record.pid}) is gone`,
		},
	})
	if (parsed.isLeft()) {
		throw parsed.value
	}

	const published = publishSummary(summaryDir, parsed.value)
	removeState(artifactRoot, state.runId)
	return published
}
