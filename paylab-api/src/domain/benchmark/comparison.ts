import { type Either, left, right } from '@/core/either'
import type { BenchmarkSummary } from './summary'

export type ScenarioComparisonState =
	| 'comparable'
	| 'new'
	| 'removed'
	| 'changed'
	| 'environment-incompatible'
	| 'dataset-incompatible'

export type RunComparison = {
	environmentCompatible: boolean
	datasetCompatible: boolean
	scenarios: { scenarioId: string; state: ScenarioComparisonState }[]
}

export class IneligibleRunError extends Error {
	constructor(readonly runId: string) {
		super(`Run ${runId} is not COMPLETED, so it cannot take part in a comparison`)
	}
}

// Each scenario is judged on its own, so suite evolution never invalidates unchanged ones.
export function compareRuns(
	current: BenchmarkSummary,
	reference: BenchmarkSummary,
): Either<IneligibleRunError, RunComparison> {
	for (const run of [current, reference]) {
		if (run.status !== 'COMPLETED') {
			return left(new IneligibleRunError(run.runId))
		}
	}

	const environmentCompatible =
		current.environment.fingerprint === reference.environment.fingerprint
	const datasetCompatible = current.dataset.fingerprint === reference.dataset.fingerprint
	const before = new Map(reference.scenarios.map((scenario) => [scenario.id, scenario]))
	const after = new Map(current.scenarios.map((scenario) => [scenario.id, scenario]))

	const ids = [...new Set([...before.keys(), ...after.keys()])].sort()
	const scenarios = ids.map((scenarioId) => {
		const now = after.get(scenarioId)
		const then = before.get(scenarioId)
		let state: ScenarioComparisonState
		if (!then) state = 'new'
		else if (!now) state = 'removed'
		else if (!environmentCompatible) state = 'environment-incompatible'
		else if (!datasetCompatible) state = 'dataset-incompatible'
		else if (now.fingerprint !== then.fingerprint) state = 'changed'
		else state = 'comparable'
		return { scenarioId, state }
	})

	return right({ environmentCompatible, datasetCompatible, scenarios })
}

export type DefaultComparison = {
	current: BenchmarkSummary
	reference: BenchmarkSummary | null
}

const compareText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

// The newest completed Run against the newest earlier completed Run that shares at least one
// comparable scenario with it. Incomplete and running Runs never take part.
export function selectDefaultComparison(runs: BenchmarkSummary[]): DefaultComparison | null {
	const completed = runs
		.filter((run) => run.status === 'COMPLETED')
		.sort((a, b) => compareText(b.startedAt, a.startedAt) || compareText(b.runId, a.runId))

	const [current, ...earlier] = completed
	if (!current) {
		return null
	}

	const reference =
		earlier.find((candidate) => {
			const comparison = compareRuns(current, candidate)
			return (
				comparison.isRight() &&
				comparison.value.scenarios.some((scenario) => scenario.state === 'comparable')
			)
		}) ?? null

	return { current, reference }
}
