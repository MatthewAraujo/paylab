import { existsSync, readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { serializeSummary } from '@/domain/benchmark/serialize'
import { publishSummary, summaryPath } from '../store'
import { readLegacySources } from './read'
import { buildImportedRuns } from './runs'

export class ImportConflictError extends Error {
	constructor(readonly path: string) {
		super(
			`${path} already exists with different content; published Summaries are immutable, so the import stops without writing anything`,
		)
	}
}

export interface ImportResult {
	/** File names newly written to the Summary directory (waiting for manual review). */
	written: string[]
	/** File names already published with identical content. */
	unchanged: string[]
}

/**
 * Publishes the imported Runs. Everything is read, validated, and compared with what is already
 * published before the first file is written, so a bad source or a conflict leaves no partial
 * output; running it again changes nothing.
 */
export function importLegacyEvidence(options: {
	rootDir: string
	summaryDir: string
}): ImportResult {
	const runs = buildImportedRuns(readLegacySources(options.rootDir))

	const plan = runs.map((run) => {
		const path = summaryPath(options.summaryDir, run.runId)
		const text = serializeSummary(run)
		if (existsSync(path) && readFileSync(path, 'utf8') !== text) {
			throw new ImportConflictError(path)
		}
		return { run, path, text, exists: existsSync(path) }
	})

	const result: ImportResult = { written: [], unchanged: [] }
	for (const { run, path, exists } of plan) {
		if (exists) {
			result.unchanged.push(basename(path))
		} else {
			publishSummary(options.summaryDir, run)
			result.written.push(basename(path))
		}
	}
	return result
}
