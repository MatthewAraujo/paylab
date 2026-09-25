import { ApiProperty } from '@nestjs/swagger'

// Documentation-only shapes of the benchmark read API (see responses.ts for the convention):
// test/e2e/openapi-contract.e2e-spec.ts fails if a real response and its schema drift apart.

export class BenchmarkStatusResponse {
	@ApiProperty({ example: true }) enabled!: boolean
	@ApiProperty({ description: 'Runs found: published Summaries plus a Run still running.' })
	runCount!: number
	@ApiProperty({ description: 'Records that could not be read and were ignored.' })
	skippedRecords!: number
	@ApiProperty({ type: String, nullable: true, description: 'The Run being executed right now.' })
	activeRunId!: string | null
}

const SUMMARY_ROLES = ['THROUGHPUT', 'LATENCY_P99', 'ERROR_RATE', 'DURATION'] as const
const DIRECTIONS = ['HIGHER_IS_BETTER', 'LOWER_IS_BETTER', 'NEUTRAL'] as const
const RUN_STATUSES = ['RUNNING', 'COMPLETED', 'INCOMPLETE'] as const
const SCENARIO_STATUSES = ['PENDING', 'ACTIVE', 'COMPLETED', 'FAILED'] as const
const ARTIFACT_KINDS = ['LOG', 'QUERY_PLAN', 'RAW_DATA'] as const
const DIMENSIONS =
	'What the value belongs to inside the scenario, for example { strategy: "nokey" }.'
const NEXT_CURSOR = 'Pass as `cursor` to get the following page; null on the last page.'

export class RunSourceResponse {
	@ApiProperty({ example: 'abc1234def', description: '"unknown" for imported Runs.' })
	commit!: string
	@ApiProperty({ example: 'main' }) branch!: string
}

export class DatasetResponse {
	@ApiProperty({ description: 'Digest of the data the measurements were taken on.' })
	fingerprint!: string
	@ApiProperty({ required: false }) description?: string
}

export class RunFailureResponse {
	@ApiProperty({ required: false }) scenarioId?: string
	@ApiProperty() summary!: string
}

export class ScenarioCountsResponse {
	@ApiProperty() total!: number
	@ApiProperty() pending!: number
	@ApiProperty() active!: number
	@ApiProperty() completed!: number
	@ApiProperty() failed!: number
}

export class HeadlineMetricResponse {
	@ApiProperty() scenarioId!: string
	@ApiProperty() key!: string
	@ApiProperty() label!: string
	@ApiProperty() unit!: string
	@ApiProperty() value!: number
	@ApiProperty({ enum: SUMMARY_ROLES }) summaryRole!: string
	@ApiProperty({
		required: false,
		type: Object,
		additionalProperties: { type: 'string' },
		description: DIMENSIONS,
	})
	dimensions?: Record<string, string>
}

export class RunListItemResponse {
	@ApiProperty() runId!: string
	@ApiProperty({ enum: ['native', 'imported'] }) kind!: string
	@ApiProperty({ enum: RUN_STATUSES }) status!: string
	@ApiProperty({ required: false }) note?: string
	@ApiProperty({ type: RunSourceResponse }) source!: RunSourceResponse
	@ApiProperty({ format: 'date-time' }) startedAt!: string
	@ApiProperty({ required: false, format: 'date-time' }) finishedAt?: string
	@ApiProperty({ required: false }) durationMs?: number
	@ApiProperty({ type: DatasetResponse }) dataset!: DatasetResponse
	@ApiProperty() environmentFingerprint!: string
	@ApiProperty({ type: ScenarioCountsResponse }) scenarioCounts!: ScenarioCountsResponse
	@ApiProperty({
		type: [HeadlineMetricResponse],
		description: 'Only the measurements a scenario explicitly featured with a summary role.',
	})
	headlineMetrics!: HeadlineMetricResponse[]
	@ApiProperty({ required: false, type: RunFailureResponse }) failure?: RunFailureResponse
}

export class SkippedRecordResponse {
	@ApiProperty({ example: 'broken.json' }) file!: string
	@ApiProperty({ example: 'not valid JSON' }) reason!: string
}

export class RunPageResponse {
	@ApiProperty({ type: [RunListItemResponse] }) items!: RunListItemResponse[]
	@ApiProperty({ type: String, nullable: true, description: NEXT_CURSOR }) nextCursor!:
		| string
		| null
	@ApiProperty({
		type: [SkippedRecordResponse],
		description: 'Records that could not be read; they never break the history.',
	})
	skipped!: SkippedRecordResponse[]
}

export class ProtocolResponse {
	@ApiProperty({ required: false }) warmupMs?: number
	@ApiProperty({ required: false }) durationMs?: number
	@ApiProperty({ required: false }) warmupRuns?: number
	@ApiProperty() repetitions!: number
	@ApiProperty() aggregation!: string
}

export class MetricResponse {
	@ApiProperty() key!: string
	@ApiProperty() label!: string
	@ApiProperty() unit!: string
	@ApiProperty({ enum: DIRECTIONS }) direction!: string
	@ApiProperty({ required: false }) aggregation?: string
	@ApiProperty({
		required: false,
		type: Object,
		additionalProperties: { type: 'string' },
		description: DIMENSIONS,
	})
	dimensions?: Record<string, string>
	@ApiProperty() value!: number
	@ApiProperty({ required: false, enum: SUMMARY_ROLES }) summaryRole?: string
}

export class ScenarioResponse {
	@ApiProperty() id!: string
	@ApiProperty() group!: string
	@ApiProperty() title!: string
	@ApiProperty({
		description: 'Definition fingerprint: equal only when the workload and protocol are.',
	})
	fingerprint!: string
	@ApiProperty({ type: ProtocolResponse }) protocol!: ProtocolResponse
	@ApiProperty({ type: Object, additionalProperties: true }) config!: Record<string, unknown>
	@ApiProperty({ enum: SCENARIO_STATUSES }) status!: string
	@ApiProperty({ required: false, format: 'date-time' }) startedAt?: string
	@ApiProperty({ required: false, format: 'date-time' }) finishedAt?: string
	@ApiProperty({ required: false }) durationMs?: number
	@ApiProperty({ type: [MetricResponse] }) metrics!: MetricResponse[]
}

export class EnvironmentResponse {
	@ApiProperty() fingerprint!: string
	@ApiProperty({ type: Object, additionalProperties: { type: 'string' } })
	details!: Record<string, string>
}

export class ExecutorResponse {
	@ApiProperty() version!: string
}

export class ImportedResponse {
	@ApiProperty({ example: 'docs/experiments/T14-results.md' }) source!: string
}

export class FailureDetailResponse {
	@ApiProperty({ required: false }) scenarioId?: string
	@ApiProperty({ required: false }) command?: string
	@ApiProperty({ required: false }) exitStatus?: number
	@ApiProperty() summary!: string
}

export class ArtifactResponse {
	@ApiProperty() id!: string
	@ApiProperty({ enum: ARTIFACT_KINDS }) kind!: string
	@ApiProperty() label!: string
	@ApiProperty({ required: false }) scenarioId?: string
	@ApiProperty({
		required: false,
		description: 'Imported Runs: the evidence file, in place in the repository.',
	})
	legacyFile?: string
	@ApiProperty({ description: 'False when the local file is gone; the Summary stays valid.' })
	available!: boolean
	@ApiProperty({ required: false }) sizeBytes?: number
}

export class RunDetailResponse {
	@ApiProperty({ example: 1 }) schemaVersion!: number
	@ApiProperty() runId!: string
	@ApiProperty({ enum: ['native', 'imported'] }) kind!: string
	@ApiProperty({ enum: RUN_STATUSES }) status!: string
	@ApiProperty({ required: false }) note?: string
	@ApiProperty({ type: RunSourceResponse }) source!: RunSourceResponse
	@ApiProperty({ format: 'date-time' }) startedAt!: string
	@ApiProperty({ required: false, format: 'date-time' }) finishedAt?: string
	@ApiProperty({ required: false }) durationMs?: number
	@ApiProperty({ type: ExecutorResponse }) executor!: ExecutorResponse
	@ApiProperty({ type: EnvironmentResponse }) environment!: EnvironmentResponse
	@ApiProperty({ type: DatasetResponse }) dataset!: DatasetResponse
	@ApiProperty({ type: [ScenarioResponse] }) scenarios!: ScenarioResponse[]
	@ApiProperty({ type: [ArtifactResponse] }) artifacts!: ArtifactResponse[]
	@ApiProperty({ required: false, type: FailureDetailResponse }) failure?: FailureDetailResponse
	@ApiProperty({ required: false, type: ImportedResponse }) imported?: ImportedResponse
	@ApiProperty({ description: 'A RUNNING record whose owner process is gone (stop polling it).' })
	abandoned!: boolean
}

export class ProgressScenarioResponse {
	@ApiProperty() id!: string
	@ApiProperty() group!: string
	@ApiProperty() title!: string
	@ApiProperty({ enum: SCENARIO_STATUSES }) status!: string
	@ApiProperty({ required: false, format: 'date-time' }) startedAt?: string
	@ApiProperty({ required: false, format: 'date-time' }) finishedAt?: string
	@ApiProperty({ required: false }) durationMs?: number
}

export class RunProgressResponse {
	@ApiProperty() runId!: string
	@ApiProperty({ enum: RUN_STATUSES }) status!: string
	@ApiProperty({ type: String, nullable: true, description: 'The scenario running right now.' })
	current!: string | null
	@ApiProperty() completed!: number
	@ApiProperty() total!: number
	@ApiProperty({ type: [ProgressScenarioResponse] }) scenarios!: ProgressScenarioResponse[]
	@ApiProperty({ required: false, type: RunFailureResponse }) failure?: RunFailureResponse
	@ApiProperty({ description: 'A RUNNING record whose owner process is gone (stop polling it).' })
	abandoned!: boolean
}

export class ArtifactContentResponse {
	@ApiProperty({ description: 'Whole lines of the sanitized text; at most 256 KiB per request.' })
	content!: string
	@ApiProperty({ description: 'Byte position this chunk starts at.' }) offset!: number
	@ApiProperty({
		type: Number,
		nullable: true,
		description: 'Pass as `offset` to read on; null at the end of the file.',
	})
	nextOffset!: number | null
	@ApiProperty({ description: 'Size of the whole file in bytes.' }) sizeBytes!: number
}

const COMPARISON_STATES = [
	'comparable',
	'new',
	'removed',
	'changed',
	'environment-incompatible',
	'dataset-incompatible',
] as const

export class ScenarioComparisonResponse {
	@ApiProperty() scenarioId!: string
	@ApiProperty({
		enum: COMPARISON_STATES,
		description:
			'Only "comparable" scenarios may be compared numerically; "new" exists only in the current Run, "removed" only in the reference.',
	})
	state!: string
}

export class ComparisonDetailResponse {
	@ApiProperty({ description: 'False when the machine or PostgreSQL facts differ.' })
	environmentCompatible!: boolean
	@ApiProperty({ description: 'False when the data the measurements were taken on differs.' })
	datasetCompatible!: boolean
	@ApiProperty({ type: [ScenarioComparisonResponse] }) scenarios!: ScenarioComparisonResponse[]
}

export class ComparisonResponse {
	@ApiProperty({ type: RunListItemResponse, nullable: true }) current!: RunListItemResponse | null
	@ApiProperty({ type: RunListItemResponse, nullable: true }) reference!: RunListItemResponse | null
	@ApiProperty({
		type: ComparisonDetailResponse,
		nullable: true,
		description: 'Null when there is no reference to compare with.',
	})
	comparison!: ComparisonDetailResponse | null
}

export class TrendRunRefResponse {
	@ApiProperty() runId!: string
	@ApiProperty({ format: 'date-time' }) startedAt!: string
}

export class TrendPointResponse {
	@ApiProperty() runId!: string
	@ApiProperty({ format: 'date-time' }) startedAt!: string
	@ApiProperty({ enum: ['native', 'imported'] }) kind!: string
	@ApiProperty() value!: number
}

export class TrendExclusionResponse {
	@ApiProperty() runId!: string
	@ApiProperty({ format: 'date-time' }) startedAt!: string
	@ApiProperty({
		enum: ['changed', 'environment-incompatible', 'dataset-incompatible', 'metric-not-recorded'],
	})
	reason!: string
}

export class IncompleteRunMarkerResponse {
	@ApiProperty() runId!: string
	@ApiProperty({ format: 'date-time' }) startedAt!: string
	@ApiProperty({ required: false }) failureSummary?: string
}

export class TrendResponse {
	@ApiProperty() scenarioId!: string
	@ApiProperty() metricKey!: string
	@ApiProperty({ type: Object, additionalProperties: { type: 'string' } })
	dimensions!: Record<string, string>
	@ApiProperty({ type: String, nullable: true }) label!: string | null
	@ApiProperty({ type: String, nullable: true }) unit!: string | null
	@ApiProperty({ type: String, nullable: true, enum: DIRECTIONS }) direction!: string | null
	@ApiProperty({
		type: TrendRunRefResponse,
		nullable: true,
		description: 'The newest completed Run with the scenario: the line follows its definition.',
	})
	reference!: TrendRunRefResponse | null
	@ApiProperty({ type: [TrendPointResponse], description: 'Chronological, comparable only.' })
	points!: TrendPointResponse[]
	@ApiProperty({
		type: [TrendExclusionResponse],
		description: 'Completed Runs left out of the line, each with its reason.',
	})
	excluded!: TrendExclusionResponse[]
	@ApiProperty({
		type: [IncompleteRunMarkerResponse],
		description: 'Incomplete Runs: timeline markers, never values.',
	})
	incompleteRuns!: IncompleteRunMarkerResponse[]
	@ApiProperty({
		type: String,
		nullable: true,
		description: 'The Baseline Run, to mark on the line when it is one of the points.',
	})
	baselineRunId!: string | null
}

export class BaselinePointerResponse {
	@ApiProperty({ description: 'The Run every Benchmark Comparison against the Baseline uses.' })
	runId!: string
	@ApiProperty({ format: 'date-time' }) selectedAt!: string
}

export class GitStateResponse {
	@ApiProperty({ description: 'False outside a Git repository.' }) available!: boolean
	@ApiProperty({ description: 'The Baseline pointer differs from what is committed.' })
	baselineChangePending!: boolean
	@ApiProperty({ type: [String], description: 'Files with uncommitted changes (at most 20).' })
	dirtyFiles!: string[]
	@ApiProperty({
		description:
			'All files with uncommitted changes. While there are any, the next `benchmark:run` refuses to start.',
	})
	dirtyCount!: number
}

export class BaselineResponse {
	@ApiProperty({ type: BaselinePointerResponse, nullable: true })
	baseline!: BaselinePointerResponse | null
	@ApiProperty({
		type: RunListItemResponse,
		nullable: true,
		description: 'The Baseline Run; null when none is selected or the Run is no longer published.',
	})
	run!: RunListItemResponse | null
	@ApiProperty({ required: false, description: 'Why an existing pointer file could not be used.' })
	problem?: string
	@ApiProperty({ type: GitStateResponse }) git!: GitStateResponse
}

export class BaselineSelectionResponse extends BaselineResponse {
	@ApiProperty({ description: 'False when the Run already was the Baseline: nothing was written.' })
	changed!: boolean
}

export class SelectBaselineRequest {
	@ApiProperty({ description: 'A completed Run, native or imported.' }) runId!: string
}
