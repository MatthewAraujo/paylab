import { type Either, left, right } from '@/core/either'
import { z } from 'zod'

export const SUMMARY_SCHEMA_VERSION = 1

// Identifiers become file and directory names, so they must never carry a path.
export const safeId = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/)

const isoTimestamp = z.string().datetime()

export const metricSchema = z.object({
	key: z.string().min(1),
	label: z.string().min(1),
	unit: z.string(),
	direction: z.enum(['HIGHER_IS_BETTER', 'LOWER_IS_BETTER']),
	aggregation: z.string().min(1).optional(),
	// Only measurements that exist are listed; an absent measurement has no entry.
	value: z.number().finite(),
	summaryRole: z.enum(['THROUGHPUT', 'LATENCY_P99', 'ERROR_RATE', 'DURATION']).optional(),
})

export const protocolSchema = z.object({
	warmupMs: z.number().nonnegative().optional(),
	durationMs: z.number().positive().optional(),
	warmupRuns: z.number().int().nonnegative().optional(),
	repetitions: z.number().int().positive(),
	aggregation: z.string().min(1),
})

export const scenarioSchema = z.object({
	id: z.string().min(1),
	group: z.string().min(1),
	title: z.string().min(1),
	fingerprint: z.string().min(1),
	protocol: protocolSchema,
	config: z.record(z.unknown()),
	status: z.enum(['PENDING', 'ACTIVE', 'COMPLETED', 'FAILED']),
	metrics: z.array(metricSchema),
})

export const artifactRefSchema = z.object({
	id: safeId,
	kind: z.enum(['LOG', 'QUERY_PLAN', 'RAW_DATA']),
	label: z.string().min(1),
	scenarioId: z.string().min(1).optional(),
})

export const failureSchema = z.object({
	scenarioId: z.string().min(1).optional(),
	command: z.string().optional(),
	exitStatus: z.number().int().optional(),
	summary: z.string().min(1),
})

const summaryShape = z.object({
	schemaVersion: z.literal(SUMMARY_SCHEMA_VERSION),
	runId: safeId,
	kind: z.enum(['native', 'imported']),
	status: z.enum(['RUNNING', 'COMPLETED', 'INCOMPLETE']),
	note: z.string().optional(),
	source: z.object({ commit: z.string().min(1), branch: z.string().min(1) }),
	startedAt: isoTimestamp,
	finishedAt: isoTimestamp.optional(),
	durationMs: z.number().nonnegative().optional(),
	executor: z.object({ version: z.string().min(1) }),
	environment: z.object({
		fingerprint: z.string().min(1),
		details: z.record(z.string()),
	}),
	dataset: z.object({
		fingerprint: z.string().min(1),
		description: z.string().optional(),
	}),
	scenarios: z.array(scenarioSchema),
	artifacts: z.array(artifactRefSchema),
	failure: failureSchema.optional(),
	imported: z.object({ source: z.string().min(1) }).optional(),
})

export const summarySchema = summaryShape.superRefine((summary, ctx) => {
	const problem = (message: string) => ctx.addIssue({ code: 'custom', message })

	if (summary.status === 'RUNNING' && summary.finishedAt) {
		problem('a RUNNING Run cannot have finishedAt')
	}
	if (summary.status !== 'RUNNING' && !summary.finishedAt) {
		problem('a terminal Run requires finishedAt')
	}
	if (
		summary.status === 'COMPLETED' &&
		summary.scenarios.some((scenario) => scenario.status !== 'COMPLETED')
	) {
		problem('a COMPLETED Run requires every scenario to be COMPLETED')
	}
	if (summary.status === 'INCOMPLETE' && !summary.failure) {
		problem('an INCOMPLETE Run requires failure evidence')
	}
	if ((summary.kind === 'imported') !== Boolean(summary.imported)) {
		problem('imported provenance is required on, and only on, imported Runs')
	}
})

export type BenchmarkMetric = z.infer<typeof metricSchema>
export type BenchmarkScenario = z.infer<typeof scenarioSchema>
export type BenchmarkSummary = z.infer<typeof summarySchema>

export class InvalidBenchmarkRecordError extends Error {
	constructor(readonly issues: string[]) {
		super(`Invalid benchmark record: ${issues.join('; ')}`)
	}
}

export function parseSummary(
	input: unknown,
): Either<InvalidBenchmarkRecordError, BenchmarkSummary> {
	const result = summarySchema.safeParse(input)
	if (!result.success) {
		return left(
			new InvalidBenchmarkRecordError(
				result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
			),
		)
	}
	return right(result.data)
}
