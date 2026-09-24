import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export interface TempRepo {
	repoDir: string
	artifactRoot: string
	summaryDir: string
	git(...args: string[]): string
	write(relativePath: string, content: string): void
	cleanup(): void
}

/** A real, clean Git repository whose Artifact root is ignored, like the API's `.benchmark/`. */
export function createTempRepo(): TempRepo {
	const repoDir = mkdtempSync(join(tmpdir(), 'paylab-bench-repo-'))
	const git = (...args: string[]) =>
		execFileSync('git', args, { cwd: repoDir, encoding: 'utf8' }).trim()

	git('init', '-q', '-b', 'main')
	git('config', 'user.email', 'bench@example.com')
	git('config', 'user.name', 'Bench')
	git('config', 'commit.gpgsign', 'false')

	const write = (relativePath: string, content: string) => {
		const target = join(repoDir, relativePath)
		mkdirSync(join(target, '..'), { recursive: true })
		writeFileSync(target, content)
	}

	write('.gitignore', '.benchmark/\n')
	write('README.md', 'fixture\n')
	git('add', '-A')
	git('commit', '-q', '-m', 'initial')

	return {
		repoDir,
		artifactRoot: join(repoDir, '.benchmark'),
		summaryDir: join(repoDir, 'bench', 'results'),
		git,
		write,
		cleanup: () => rmSync(repoDir, { recursive: true, force: true }),
	}
}
