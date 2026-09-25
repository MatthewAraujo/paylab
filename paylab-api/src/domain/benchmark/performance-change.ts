export type MetricDirection = 'HIGHER_IS_BETTER' | 'LOWER_IS_BETTER' | 'NEUTRAL'

export type PerformanceChange =
	| {
			kind: 'compared'
			absoluteDelta: number
			percentDelta: number
			classification: 'improved' | 'stable' | 'regressed'
	  }
	| { kind: 'not-comparable'; reason: 'missing-value' | 'zero-reference' | 'informational' }

// A presentation tolerance, not a claim of statistical significance.
export const STABLE_TOLERANCE_PERCENT = 5

// Absorbs binary floating-point error so that exactly ±5% is still stable.
const RELATIVE_EPSILON = 1e-9

export function classifyChange(input: {
	current: number | undefined
	reference: number | undefined
	direction: MetricDirection
}): PerformanceChange {
	const { current, reference, direction } = input
	if (current === undefined || reference === undefined) {
		return { kind: 'not-comparable', reason: 'missing-value' }
	}
	if (direction === 'NEUTRAL') {
		return { kind: 'not-comparable', reason: 'informational' }
	}
	if (reference === 0) {
		return { kind: 'not-comparable', reason: 'zero-reference' }
	}

	const absoluteDelta = current - reference
	const percentDelta = (absoluteDelta / Math.abs(reference)) * 100
	const limit = (STABLE_TOLERANCE_PERCENT / 100 + RELATIVE_EPSILON) * Math.abs(reference)

	if (Math.abs(absoluteDelta) <= limit) {
		return { kind: 'compared', absoluteDelta, percentDelta, classification: 'stable' }
	}

	const favorable = direction === 'HIGHER_IS_BETTER' ? absoluteDelta > 0 : absoluteDelta < 0
	return {
		kind: 'compared',
		absoluteDelta,
		percentDelta,
		classification: favorable ? 'improved' : 'regressed',
	}
}
