import { execFileSync } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'

export interface GitState {
	/** False outside a Git repository (or without Git): reported, never an error. */
	available: boolean
	/** The Baseline pointer file differs from what is committed. */
	baselineChangePending: boolean
	/** Files with uncommitted changes, at most `MAX_LISTED`. */
	dirtyFiles: string[]
	/** All files with uncommitted changes: any of them blocks the next benchmark Run. */
	dirtyCount: number
}

const MAX_LISTED = 20

const UNAVAILABLE: GitState = {
	available: false,
	baselineChangePending: false,
	dirtyFiles: [],
	dirtyCount: 0,
}

/**
 * Read-only view of the worktree, the same one that makes `benchmark:run` refuse to start:
 * tracked and untracked changes count, ignored files do not. Nothing is ever staged or committed.
 */
export function readGitState(rootDir: string, baselineFile: string): GitState {
	let top: string
	let status: string
	try {
		top = realpathSync(
			execFileSync('git', ['rev-parse', '--show-toplevel'], {
				cwd: rootDir,
				encoding: 'utf8',
			}).trim(),
		)
		// Not trimmed: a porcelain line starts with a significant space (" M path").
		status = execFileSync('git', ['status', '--porcelain', '--untracked-files=all'], {
			cwd: rootDir,
			encoding: 'utf8',
		})
	} catch {
		return UNAVAILABLE
	}

	const files = status
		.split('\n')
		.filter((line) => line.length > 0)
		.map((line) => line.slice(3).split(' -> ').at(-1) as string)

	let baseline: string | null = null
	try {
		baseline = resolve(realpathSync(dirname(baselineFile)), basename(baselineFile))
	} catch {
		// no directory yet, so nothing of the Baseline can be pending
	}

	return {
		available: true,
		baselineChangePending:
			baseline !== null && files.some((file) => resolve(top, file) === baseline),
		dirtyFiles: files.slice(0, MAX_LISTED),
		dirtyCount: files.length,
	}
}
