import { type Either, left, right } from '@/core/either'
import { z } from 'zod'
import { type BenchmarkSummary, InvalidBenchmarkRecordError, safeId } from './summary'

export const BASELINE_SCHEMA_VERSION = 1

// A small pointer to a Run. It never copies or changes the Run's evidence.
export const baselineSchema = z.object({
	schemaVersion: z.literal(BASELINE_SCHEMA_VERSION),
	runId: safeId,
	selectedAt: z.string().datetime(),
})

export type BenchmarkBaseline = z.infer<typeof baselineSchema>

export function parseBaseline(
	input: unknown,
): Either<InvalidBenchmarkRecordError, BenchmarkBaseline> {
	const result = baselineSchema.safeParse(input)
	if (!result.success) {
		return left(
			new InvalidBenchmarkRecordError(
				result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
			),
		)
	}
	return right(result.data)
}

export function isBaselineEligible(run: BenchmarkSummary): boolean {
	return run.status === 'COMPLETED'
}
