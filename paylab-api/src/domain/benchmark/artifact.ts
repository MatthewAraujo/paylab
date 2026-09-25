import { type BenchmarkSummary, safeId } from './summary'

export type ArtifactKind = BenchmarkSummary['artifacts'][number]['kind']

export const ARTIFACT_EXTENSIONS: Record<ArtifactKind, string> = {
	LOG: '.log',
	QUERY_PLAN: '.plan.txt',
	RAW_DATA: '.jsonl',
}

// Longest first, so ".plan.txt" is never mistaken for a shorter suffix.
const KINDS = (Object.keys(ARTIFACT_EXTENSIONS) as ArtifactKind[]).sort(
	(a, b) => ARTIFACT_EXTENSIONS[b].length - ARTIFACT_EXTENSIONS[a].length,
)

/** The file that holds an Artifact inside its Run's artifacts directory. */
export function artifactFileName(ref: { id: string; kind: ArtifactKind }): string {
	return `${ref.id}${ARTIFACT_EXTENSIONS[ref.kind]}`
}

/** What a scenario output file is, decided by its suffix; anything else is not evidence. */
export function artifactKindOfFile(fileName: string): ArtifactKind | null {
	return KINDS.find((kind) => fileName.endsWith(ARTIFACT_EXTENSIONS[kind])) ?? null
}

/** A safe Artifact id for a file a scenario wrote, or null when none can be built. */
export function artifactIdForFile(scenarioId: string, fileName: string): string | null {
	const kind = artifactKindOfFile(fileName)
	if (!kind) {
		return null
	}
	const base = fileName
		.slice(0, -ARTIFACT_EXTENSIONS[kind].length)
		.replace(/[^A-Za-z0-9._-]+/g, '-')
		.replace(/^-+/, '')
		.replace(/-+$/, '')
	if (base.length === 0) {
		return null
	}
	const id = `${scenarioId}-${base}`
	return safeId.safeParse(id).success ? id : null
}
