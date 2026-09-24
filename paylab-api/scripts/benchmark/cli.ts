import { spawnSync } from 'node:child_process'
import { isAbsolute, join, relative } from 'node:path'
import type { RunResult } from './executor'

export const EXECUTOR_VERSION = '1'

export class CliUsageError extends Error {}

const USAGE =
	'benchmark:run always runs the complete Benchmark Suite; the only option is --note <text>'

/** There is deliberately no scenario selection: a published Run represents the whole suite. */
export function parseCliArgs(argv: string[]): { note?: string } {
	let note: string | undefined
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i]
		if (arg === '--note' || arg.startsWith('--note=')) {
			const value = arg === '--note' ? argv[++i] : arg.slice('--note='.length)
			if (!value || value.trim().length === 0) {
				throw new CliUsageError(`--note needs some text. ${USAGE}`)
			}
			note = value
		} else {
			throw new CliUsageError(`Unknown argument "${arg}". ${USAGE}`)
		}
	}
	return note === undefined ? {} : { note }
}

export function formatReport(result: RunResult): string {
	const { summary } = result
	const lines = [`Benchmark Run ${summary.runId}: ${summary.status}`]
	if (summary.failure) {
		lines.push(`Failure: ${summary.failure.summary}`)
	}
	lines.push(
		'',
		'Generated files (not committed; review them, then commit):',
		...result.files.map((file) => `  ${file}`),
		'',
		'Suggested commit message:',
		`  ${result.suggestedCommitMessage}`,
		'',
		'The next Run is blocked until these changes are committed or removed.',
	)
	return lines.join('\n')
}

export const exitCodeFor = (result: RunResult) => (result.summary.status === 'COMPLETED' ? 0 : 1)

const SENSITIVE_NAME = /(password|passwd|secret|token|api[_-]?key|credential|private[_-]?key)/i

/** Values that must be redacted from every stored log, whatever form they appear in. */
export function collectSecrets(env: Record<string, string | undefined>): string[] {
	return Object.entries(env)
		.filter(
			([name, value]) => value && (name.endsWith('DATABASE_URL') || SENSITIVE_NAME.test(name)),
		)
		.map(([, value]) => value as string)
}

/**
 * Artifact files must not show up as worktree changes, or they would block the next Run.
 * An Artifact root outside the repository needs no ignore rule.
 */
export function assertArtifactRootIgnored(repoDir: string, artifactRoot: string) {
	const inside = relative(repoDir, artifactRoot)
	if (inside.startsWith('..') || isAbsolute(inside)) {
		return
	}
	// The probe sits inside the directory: a "dir/" ignore rule only matches paths below it.
	const probe = join(artifactRoot, 'lock.json')
	const check = spawnSync('git', ['check-ignore', '-q', probe], { cwd: repoDir })
	if (check.status !== 0) {
		throw new Error(
			`The Artifact root ${artifactRoot} is inside the repository but not ignored by Git. Add it to .gitignore (or set BENCH_ARTIFACT_ROOT elsewhere) so retained logs never count as worktree changes.`,
		)
	}
}
