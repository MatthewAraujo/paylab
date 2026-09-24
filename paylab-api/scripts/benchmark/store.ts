import {
	appendFileSync,
	existsSync,
	linkSync,
	mkdirSync,
	readFileSync,
	renameSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { type ArtifactKind, artifactFileName } from '@/domain/benchmark/artifact'
import { serializeSummary } from '@/domain/benchmark/serialize'
import { type BenchmarkSummary, parseSummary } from '@/domain/benchmark/summary'

export class SummaryAlreadyPublishedError extends Error {
	constructor(readonly path: string) {
		super(`A Summary already exists at ${path}; published Summaries are immutable`)
	}
}

/** Replace a file all at once, so a reader never sees a half-written record. */
export function atomicWrite(path: string, text: string) {
	mkdirSync(dirname(path), { recursive: true })
	const temp = `${path}.${process.pid}.tmp`
	writeFileSync(temp, text)
	renameSync(temp, path)
}

export const runDir = (artifactRoot: string, runId: string) => join(artifactRoot, 'runs', runId)
export const statePath = (artifactRoot: string, runId: string) =>
	join(runDir(artifactRoot, runId), 'state.json')
export const artifactsDir = (artifactRoot: string, runId: string) =>
	join(runDir(artifactRoot, runId), 'artifacts')
export const artifactPath = (
	artifactRoot: string,
	runId: string,
	ref: { id: string; kind: ArtifactKind },
) => join(artifactsDir(artifactRoot, runId), artifactFileName(ref))
/** Where a running scenario drops extra evidence; the executor sanitizes and registers it. */
export const incomingDir = (artifactRoot: string, runId: string, scenarioId: string) =>
	join(runDir(artifactRoot, runId), 'incoming', scenarioId)
export const summaryPath = (summaryDir: string, runId: string) => join(summaryDir, `${runId}.json`)

/** The mutable RUNNING record; it lives in the local Artifact root, never in Git. */
export function writeState(artifactRoot: string, summary: BenchmarkSummary) {
	atomicWrite(statePath(artifactRoot, summary.runId), serializeSummary(summary))
}

export function readState(artifactRoot: string, runId: string): BenchmarkSummary | null {
	const path = statePath(artifactRoot, runId)
	if (!existsSync(path)) {
		return null
	}
	const parsed = parseSummary(JSON.parse(readFileSync(path, 'utf8')))
	if (parsed.isLeft()) {
		throw parsed.value
	}
	return parsed.value
}

export function removeState(artifactRoot: string, runId: string) {
	rmSync(statePath(artifactRoot, runId), { force: true })
}

export function appendArtifactLine(path: string, line: string) {
	mkdirSync(dirname(path), { recursive: true })
	appendFileSync(path, `${line}\n`)
}

/**
 * The terminal Summary is written to a temporary file and then hard-linked into place: the
 * link fails if the target exists, so a published Summary can never be overwritten.
 */
export function publishSummary(summaryDir: string, summary: BenchmarkSummary): string {
	const target = summaryPath(summaryDir, summary.runId)
	mkdirSync(summaryDir, { recursive: true })
	const temp = `${target}.${process.pid}.tmp`
	writeFileSync(temp, serializeSummary(summary))
	try {
		linkSync(temp, target)
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
			throw new SummaryAlreadyPublishedError(target)
		}
		throw error
	} finally {
		unlinkSync(temp)
	}
	return target
}
