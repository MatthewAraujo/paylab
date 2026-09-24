import { execFileSync } from 'node:child_process'

export interface SourceRevision {
	commit: string
	branch: string
}

export class DirtyWorktreeError extends Error {
	constructor(readonly paths: string[]) {
		super(
			`The Git worktree has uncommitted changes, so the Run cannot be attributed to a commit. Commit or discard them first:\n- ${paths.join('\n- ')}`,
		)
	}
}

// Not trimmed: a porcelain status line starts with a significant space (" M path").
function gitRaw(repoDir: string, args: string[]) {
	return execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' })
}

function git(repoDir: string, args: string[]) {
	return gitRaw(repoDir, args).trim()
}

/**
 * Every Run must come from an exact committed revision. Tracked and untracked changes both
 * count; ignored files (the local Artifact root) do not. This also blocks a new Run while a
 * previously generated Summary or Baseline change is still uncommitted.
 */
export function assertCleanWorktree(repoDir: string): SourceRevision {
	const lines = gitRaw(repoDir, ['status', '--porcelain', '--untracked-files=all'])
		.split('\n')
		.filter((line) => line.length > 0)
	if (lines.length > 0) {
		throw new DirtyWorktreeError(lines.map((line) => line.slice(3)))
	}
	return {
		commit: git(repoDir, ['rev-parse', 'HEAD']),
		branch: git(repoDir, ['rev-parse', '--abbrev-ref', 'HEAD']),
	}
}
