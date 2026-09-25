import { basename } from 'node:path'
import { artifactFileName } from '@/domain/benchmark/artifact'
import { isBaselineEligible } from '@/domain/benchmark/baseline'
import { compareRuns, selectDefaultComparison } from '@/domain/benchmark/comparison'
import { buildTrend, toProgress, toRunListItem } from '@/domain/benchmark/read-models'
import { type BenchmarkSummary, safeId } from '@/domain/benchmark/summary'
import { type ArtifactFile, BenchmarkStore } from '@/infra/benchmark/benchmark-store'
import { BenchmarkEnabledGuard } from '@/infra/http/benchmark-enabled.guard'
import { limitSchema } from '@/infra/http/pagination/query-schemas'
import { decodeRunCursor, encodeRunCursor } from '@/infra/http/pagination/run-cursor'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	Body,
	Controller,
	Get,
	NotFoundException,
	Param,
	Put,
	Query,
	StreamableFile,
	UnprocessableEntityException,
	UseGuards,
} from '@nestjs/common'
import { ApiBody, ApiParam, ApiProduces, ApiQuery, ApiResponse, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import {
	ArtifactContentResponse,
	ArtifactResponse,
	BaselineResponse,
	BaselineSelectionResponse,
	BenchmarkStatusResponse,
	ComparisonResponse,
	RunDetailResponse,
	RunPageResponse,
	RunProgressResponse,
	SelectBaselineRequest,
	TrendResponse,
} from '../openapi/benchmark-responses'
import { ApiBenchmarkRoute } from '../openapi/decorators'
import { ValidationErrorResponse } from '../openapi/responses'

const runIdPipe = new ZodValidationPipe(safeId)
const artifactIdPipe = new ZodValidationPipe(safeId)

// One request never returns more than this many bytes of an Artifact; larger ones are read in chunks.
const MAX_INLINE_BYTES = 256 * 1024
const contentQuerySchema = z
	.object({
		offset: z.coerce.number().int().min(0).default(0),
		limit: z.coerce
			.number()
			.int()
			.min(1)
			.max(MAX_INLINE_BYTES)
			.default(64 * 1024),
	})
	.strict()
type ContentQuery = z.infer<typeof contentQuerySchema>

const selectBaselineBodySchema = z.object({ runId: safeId }).strict()
type SelectBaselineBody = z.infer<typeof selectBaselineBodySchema>

const comparisonQuerySchema = z.object({ current: safeId, reference: safeId }).strict()
type ComparisonQuery = z.infer<typeof comparisonQuerySchema>

// `dimension=strategy:nokey`, repeatable; each key at most once.
const dimensionsSchema = z
	.union([z.string(), z.array(z.string())])
	.optional()
	.transform((value, ctx) => {
		const entries: Record<string, string> = {}
		for (const raw of value === undefined ? [] : Array.isArray(value) ? value : [value]) {
			const match = /^([A-Za-z0-9_.-]+):(\S+)$/.exec(raw)
			if (!match || match[1] in entries) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid dimension "${raw}".` })
				return z.NEVER
			}
			entries[match[1]] = match[2]
		}
		return entries
	})

const trendQuerySchema = z
	.object({
		scenarioId: z.string().regex(/^[A-Za-z0-9._-]{1,200}$/),
		metric: z.string().regex(/^[A-Za-z0-9._-]{1,100}$/),
		dimension: dimensionsSchema,
	})
	.strict()
type TrendQuery = z.infer<typeof trendQuerySchema>

const runCursorSchema = z.string().transform((value, ctx) => {
	const position = decodeRunCursor(value)
	if (!position) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor.' })
		return z.NEVER
	}
	return position
})

// Cursor-only keyset pagination, newest first: unknown parameters (offset, page) are rejected.
const listQuerySchema = z
	.object({
		limit: limitSchema,
		cursor: runCursorSchema.optional(),
		status: z.enum(['RUNNING', 'COMPLETED', 'INCOMPLETE']).optional(),
	})
	.strict()
type ListQuery = z.infer<typeof listQuerySchema>

// Ordering and cursor use the canonical instant, so equivalent spellings of one time sort together.
const instant = (run: BenchmarkSummary) => new Date(run.startedAt).toISOString()
const newestFirst = (a: BenchmarkSummary, b: BenchmarkSummary) =>
	instant(a) < instant(b)
		? 1
		: instant(a) > instant(b)
			? -1
			: a.runId < b.runId
				? 1
				: a.runId > b.runId
					? -1
					: 0

@ApiTags('Benchmarks')
@Controller('v1/benchmarks')
@UseGuards(BenchmarkEnabledGuard)
export class BenchmarksController {
	constructor(private readonly store: BenchmarkStore) {}

	private requireRun(runId: string): BenchmarkSummary {
		const run = this.store.findRun(runId)
		if (!run) {
			throw new NotFoundException({
				code: 'BENCHMARK_RUN_NOT_FOUND',
				message: 'No Benchmark Run with that id.',
			})
		}
		return run
	}

	@Get('status')
	@ApiBenchmarkRoute(BenchmarkStatusResponse)
	status(): BenchmarkStatusResponse {
		const { runs, skipped } = this.store.loadRuns()
		return {
			enabled: true,
			runCount: runs.length,
			skippedRecords: skipped.length,
			activeRunId: this.store.activeRunId(),
		}
	}

	@Get('runs')
	@ApiBenchmarkRoute(RunPageResponse, { validated: true })
	@ApiQuery({
		name: 'limit',
		required: false,
		schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
	})
	@ApiQuery({
		name: 'cursor',
		required: false,
		description: 'Opaque `nextCursor` from the previous page.',
		schema: { type: 'string' },
	})
	@ApiQuery({ name: 'status', required: false, enum: ['RUNNING', 'COMPLETED', 'INCOMPLETE'] })
	list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery): RunPageResponse {
		const { runs, skipped } = this.store.loadRuns()
		const after = query.cursor
		const matching = runs
			.filter((run) => !query.status || run.status === query.status)
			.sort(newestFirst)
			.filter(
				(run) =>
					!after ||
					instant(run) < after.startedAt ||
					(instant(run) === after.startedAt && run.runId < after.runId),
			)

		const page = matching.slice(0, query.limit)
		const last = page.at(-1)
		return {
			items: page.map(toRunListItem),
			nextCursor:
				matching.length > page.length && last
					? encodeRunCursor({ startedAt: instant(last), runId: last.runId })
					: null,
			skipped,
		}
	}

	@Get('runs/:runId')
	@ApiBenchmarkRoute(RunDetailResponse, { notFound: true, validated: true })
	@ApiParam({ name: 'runId' })
	detail(@Param('runId', runIdPipe) runId: string): RunDetailResponse {
		const run = this.requireRun(runId)
		return {
			...run,
			artifacts: this.store.listArtifacts(run).map((file) => ({
				...file.ref,
				available: file.available,
				sizeBytes: file.sizeBytes,
			})),
			abandoned: this.store.isAbandoned(runId),
		}
	}

	@Get('runs/:runId/progress')
	@ApiBenchmarkRoute(RunProgressResponse, { notFound: true, validated: true })
	@ApiParam({ name: 'runId' })
	progress(@Param('runId', runIdPipe) runId: string): RunProgressResponse {
		const run = this.requireRun(runId)
		return { ...toProgress(run), abandoned: this.store.isAbandoned(runId) }
	}

	private requireArtifact(
		runId: string,
		artifactId: string,
	): { run: BenchmarkSummary; file: ArtifactFile } {
		const run = this.requireRun(runId)
		const file = this.store.resolveArtifact(run, artifactId)
		if (!file) {
			throw new NotFoundException({
				code: 'BENCHMARK_ARTIFACT_NOT_FOUND',
				message: 'This Run has no Artifact with that id.',
			})
		}
		return { run, file }
	}

	private requireAvailable(runId: string, artifactId: string): ArtifactFile {
		const { file } = this.requireArtifact(runId, artifactId)
		if (!file.available) {
			throw new NotFoundException({
				code: 'BENCHMARK_ARTIFACT_UNAVAILABLE',
				message: 'The Artifact is listed, but its local file is no longer available.',
			})
		}
		return file
	}

	@Get('runs/:runId/artifacts/:artifactId')
	@ApiBenchmarkRoute(ArtifactResponse, { notFound: true, validated: true })
	@ApiParam({ name: 'runId' })
	@ApiParam({ name: 'artifactId' })
	artifact(
		@Param('runId', runIdPipe) runId: string,
		@Param('artifactId', artifactIdPipe) artifactId: string,
	): ArtifactResponse {
		const { file } = this.requireArtifact(runId, artifactId)
		return { ...file.ref, available: file.available, sizeBytes: file.sizeBytes }
	}

	@Get('runs/:runId/artifacts/:artifactId/content')
	@ApiBenchmarkRoute(ArtifactContentResponse, { notFound: true, validated: true })
	@ApiParam({ name: 'runId' })
	@ApiParam({ name: 'artifactId' })
	@ApiQuery({
		name: 'offset',
		required: false,
		schema: { type: 'integer', minimum: 0, default: 0 },
	})
	@ApiQuery({
		name: 'limit',
		required: false,
		schema: { type: 'integer', minimum: 1, maximum: MAX_INLINE_BYTES, default: 65536 },
	})
	content(
		@Param('runId', runIdPipe) runId: string,
		@Param('artifactId', artifactIdPipe) artifactId: string,
		@Query(new ZodValidationPipe(contentQuerySchema)) query: ContentQuery,
	): ArtifactContentResponse {
		return this.store.readArtifact(this.requireAvailable(runId, artifactId), query)
	}

	@Get('runs/:runId/artifacts/:artifactId/download')
	@ApiProduces('text/plain')
	@ApiBenchmarkRoute(String, { notFound: true, validated: true })
	@ApiParam({ name: 'runId' })
	@ApiParam({ name: 'artifactId' })
	download(
		@Param('runId', runIdPipe) runId: string,
		@Param('artifactId', artifactIdPipe) artifactId: string,
	): StreamableFile {
		const file = this.requireAvailable(runId, artifactId)
		const name = file.ref.legacyFile ? basename(file.ref.legacyFile) : artifactFileName(file.ref)
		return new StreamableFile(this.store.openArtifact(file), {
			type: 'text/plain; charset=utf-8',
			disposition: `attachment; filename="${name}"`,
		})
	}

	@Get('comparisons/default')
	@ApiBenchmarkRoute(ComparisonResponse)
	defaultComparison(): ComparisonResponse {
		const completed = this.store.loadRuns().runs.filter((run) => run.status === 'COMPLETED')
		const selection = selectDefaultComparison(completed)
		if (!selection) {
			return { current: null, reference: null, comparison: null }
		}
		const { current, reference } = selection
		const comparison = reference ? compareRuns(current, reference) : null
		return {
			current: toRunListItem(current),
			reference: reference ? toRunListItem(reference) : null,
			comparison: comparison?.isRight() ? comparison.value : null,
		}
	}

	@Get('comparisons')
	@ApiBenchmarkRoute(ComparisonResponse, { notFound: true, validated: true })
	@ApiQuery({ name: 'current', required: true, description: 'Run id of the Run being examined.' })
	@ApiQuery({ name: 'reference', required: true, description: 'Run id to compare it with.' })
	compare(
		@Query(new ZodValidationPipe(comparisonQuerySchema)) query: ComparisonQuery,
	): ComparisonResponse {
		const current = this.requireRun(query.current)
		const reference = this.requireRun(query.reference)
		const comparison = compareRuns(current, reference)
		if (comparison.isLeft()) {
			throw new UnprocessableEntityException({
				message: comparison.value.message,
				statusCode: 422,
				code: 'BENCHMARK_RUN_NOT_COMPARABLE',
			})
		}
		return {
			current: toRunListItem(current),
			reference: toRunListItem(reference),
			comparison: comparison.value,
		}
	}

	@Get('trends')
	@ApiBenchmarkRoute(TrendResponse, { validated: true })
	@ApiQuery({ name: 'scenarioId', required: true })
	@ApiQuery({ name: 'metric', required: true, description: 'Metric key, for example `tps`.' })
	@ApiQuery({
		name: 'dimension',
		required: false,
		isArray: true,
		description: 'Repeatable `key:value`, for example `strategy:nokey`.',
		schema: { type: 'array', items: { type: 'string' } },
	})
	trend(@Query(new ZodValidationPipe(trendQuerySchema)) query: TrendQuery): TrendResponse {
		const trend = buildTrend(this.store.loadRuns().runs, {
			scenarioId: query.scenarioId,
			metricKey: query.metric,
			dimensions: query.dimension,
		})
		return { ...trend, baselineRunId: this.store.readBaseline().baseline?.runId ?? null }
	}

	private baselineView(): BaselineResponse {
		const { baseline, problem } = this.store.readBaseline()
		const run = baseline ? this.store.findRun(baseline.runId) : null
		return {
			baseline: baseline && { runId: baseline.runId, selectedAt: baseline.selectedAt },
			run: run ? toRunListItem(run) : null,
			problem,
			git: this.store.gitState(),
		}
	}

	@Get('baseline')
	@ApiBenchmarkRoute(BaselineResponse)
	baseline(): BaselineResponse {
		return this.baselineView()
	}

	@Put('baseline')
	@ApiBenchmarkRoute(BaselineSelectionResponse, { notFound: true })
	@ApiBody({ type: SelectBaselineRequest })
	@ApiResponse({
		status: 422,
		type: ValidationErrorResponse,
		description:
			'Invalid body, or the Run is not eligible (code BENCHMARK_BASELINE_INELIGIBLE): only a completed Run can be the Baseline.',
	})
	selectBaseline(
		@Body(new ZodValidationPipe(selectBaselineBodySchema)) body: SelectBaselineBody,
	): BaselineSelectionResponse {
		const run = this.requireRun(body.runId)
		if (!isBaselineEligible(run)) {
			throw new UnprocessableEntityException({
				message: `Run ${run.runId} is ${run.status}; only a COMPLETED Run can be the Baseline.`,
				statusCode: 422,
				code: 'BENCHMARK_BASELINE_INELIGIBLE',
			})
		}
		const { changed } = this.store.writeBaseline(run.runId)
		return { ...this.baselineView(), changed }
	}
}
