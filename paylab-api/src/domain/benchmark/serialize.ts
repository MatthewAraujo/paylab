import { canonicalJson } from './canonical'
import type { BenchmarkSummary } from './summary'

// Deterministic, reviewable text for the versioned Summary file.
export function serializeSummary(summary: BenchmarkSummary): string {
	return `${canonicalJson(summary, 2)}\n`
}
