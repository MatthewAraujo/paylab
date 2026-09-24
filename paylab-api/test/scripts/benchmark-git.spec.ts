import { DirtyWorktreeError, assertCleanWorktree } from '../../scripts/benchmark/git'
import { type TempRepo, createTempRepo } from '../support/git-repo'

describe('assertCleanWorktree', () => {
	let repo: TempRepo

	beforeEach(() => {
		repo = createTempRepo()
	})
	afterEach(() => repo.cleanup())

	it('returns the exact revision of a clean worktree', () => {
		const source = assertCleanWorktree(repo.repoDir)

		expect(source).toEqual({ commit: repo.git('rev-parse', 'HEAD'), branch: 'main' })
		expect(source.commit).toMatch(/^[0-9a-f]{40}$/)
	})

	it('rejects a modified tracked file and names it', () => {
		repo.write('README.md', 'changed\n')

		expect(() => assertCleanWorktree(repo.repoDir)).toThrow(DirtyWorktreeError)
		expect(() => assertCleanWorktree(repo.repoDir)).toThrow(/README\.md/)
	})

	it('rejects an untracked file', () => {
		repo.write('bench/results/new.json', '{}\n')

		expect(() => assertCleanWorktree(repo.repoDir)).toThrow(/bench\/results\/new\.json/)
	})

	it('does not count gitignored Artifact files as changes', () => {
		repo.write('.benchmark/runs/r1/artifacts/log.txt', 'evidence\n')

		expect(() => assertCleanWorktree(repo.repoDir)).not.toThrow()
	})
})
