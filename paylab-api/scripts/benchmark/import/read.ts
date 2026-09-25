import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVIDENCE } from './manifest'
import { ImportSourceError } from './sources'

export interface LegacySources {
	t13Baseline: { queries: string; depth: string }
	t13Adopted: { queries: string; depth: string }
	t14: { load: string; correctness: string }
}

/** Reads the structured evidence, and checks that every file the Runs will reference exists. */
export function readLegacySources(rootDir: string): LegacySources {
	for (const file of Object.values(EVIDENCE)) {
		if (!existsSync(join(rootDir, file))) {
			throw new ImportSourceError(file, 'evidence file not found')
		}
	}
	const read = (file: string) => readFileSync(join(rootDir, file), 'utf8')
	return {
		t13Baseline: {
			queries: read(EVIDENCE.t13BaselineQueries),
			depth: read(EVIDENCE.t13BaselineDepth),
		},
		t13Adopted: {
			queries: read(EVIDENCE.t13AdoptedQueries),
			depth: read(EVIDENCE.t13AdoptedDepth),
		},
		t14: { load: read(EVIDENCE.t14Load), correctness: read(EVIDENCE.t14Correctness) },
	}
}
