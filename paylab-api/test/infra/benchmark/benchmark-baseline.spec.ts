import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalJson } from '@/domain/benchmark/canonical'
import { BenchmarkStore } from '@/infra/benchmark/benchmark-store'
import { DirtyWorktreeError, assertCleanWorktree } from '../../../scripts/benchmark/git'
import { buildSummary } from '../../support/benchmark-fixtures'
import { type TempRepo, createTempRepo } from '../../support/git-repo'

describe('Baseline pointer and the pending Git change', () => {
	let repo: TempRepo
	let store: BenchmarkStore
	const baselineFile = () => join(repo.repoDir, 'bench', 'baseline.json')
	const commit = () => {
		repo.git('add', '-A')
		repo.git('commit', '-q', '-m', 'save')
	}

	beforeEach(() => {
		repo = createTempRepo()
		store = new BenchmarkStore({
			rootDir: repo.repoDir,
			summaryDir: repo.summaryDir,
			artifactRoot: repo.artifactRoot,
			baselineFile: baselineFile(),
			secrets: [],
		})
	})
	afterEach(() => repo.cleanup())

	const at = new Date('2026-09-24T09:00:00.000Z')

	describe('the pointer', () => {
		it('is absent until one is selected', () => {
			expect(store.readBaseline()).toEqual({ baseline: null })
		})

		it('is a small deterministic file that names the Run and when it was selected', () => {
			const result = store.writeBaseline('run-a', at)

			expect(result).toEqual({
				baseline: { schemaVersion: 1, runId: 'run-a', selectedAt: '2026-09-24T09:00:00.000Z' },
				changed: true,
			})
			expect(readFileSync(baselineFile(), 'utf8')).toBe(`${canonicalJson(result.baseline, 2)}\n`)
			expect(store.readBaseline().baseline).toEqual(result.baseline)
			expect(readdirSync(join(repo.repoDir, 'bench')).sort()).toEqual(['baseline.json'])
		})

		it('is replaced by selecting another Run, leaving nothing else behind', () => {
			store.writeBaseline('run-a', at)

			store.writeBaseline('run-b', new Date('2026-09-25T09:00:00.000Z'))

			expect(store.readBaseline().baseline).toMatchObject({ runId: 'run-b' })
			expect(readdirSync(join(repo.repoDir, 'bench'))).toEqual(['baseline.json'])
		})

		it('is not rewritten when the same Run is selected again', () => {
			store.writeBaseline('run-a', at)
			const before = readFileSync(baselineFile(), 'utf8')

			const again = store.writeBaseline('run-a', new Date('2027-01-01T00:00:00.000Z'))

			expect(again.changed).toBe(false)
			expect(readFileSync(baselineFile(), 'utf8')).toBe(before)
		})

		it('never touches a published Summary', () => {
			mkdirSync(repo.summaryDir, { recursive: true })
			const summary = join(repo.summaryDir, 'run-a.json')
			writeFileSync(summary, JSON.stringify(buildSummary({ runId: 'run-a' })))
			const before = readFileSync(summary, 'utf8')

			store.writeBaseline('run-a', at)
			store.writeBaseline('run-b', at)

			expect(readFileSync(summary, 'utf8')).toBe(before)
		})

		it('reports a damaged pointer instead of failing', () => {
			mkdirSync(join(repo.repoDir, 'bench'), { recursive: true })
			writeFileSync(baselineFile(), '{not json')

			const result = store.readBaseline()

			expect(result.baseline).toBeNull()
			expect(result.problem).toMatch(/JSON/i)
		})

		it('refuses a Run id that could name a path', () => {
			expect(() => store.writeBaseline('../evil', at)).toThrow()
		})
	})

	describe('the pending Git change', () => {
		it('is nothing on a clean worktree', () => {
			expect(store.gitState()).toEqual({
				available: true,
				baselineChangePending: false,
				dirtyFiles: [],
				dirtyCount: 0,
			})
		})

		it('shows the Baseline change as pending, and never commits it', () => {
			const commits = repo.git('rev-list', '--count', 'HEAD')

			store.writeBaseline('run-a', at)

			expect(store.gitState()).toEqual({
				available: true,
				baselineChangePending: true,
				dirtyFiles: ['bench/baseline.json'],
				dirtyCount: 1,
			})
			expect(repo.git('rev-list', '--count', 'HEAD')).toBe(commits)
			expect(repo.git('diff', '--cached', '--name-only')).toBe('')
		})

		it('is clear again once the change is committed', () => {
			store.writeBaseline('run-a', at)
			commit()

			expect(store.gitState()).toMatchObject({ baselineChangePending: false, dirtyCount: 0 })
		})

		it('lists other pending changes too, bounded, because they block the next Run as well', () => {
			for (let i = 0; i < 25; i++) repo.write(`notes/${i}.txt`, 'x')

			const state = store.gitState()

			expect(state.baselineChangePending).toBe(false)
			expect(state.dirtyCount).toBe(25)
			expect(state.dirtyFiles).toHaveLength(20)
		})

		it('is reported as unavailable, not as an error, outside a Git repository', () => {
			const outside = mkdtempSync(join(tmpdir(), 'paylab-nogit-'))
			try {
				const bare = new BenchmarkStore({
					rootDir: outside,
					summaryDir: join(outside, 'r'),
					artifactRoot: join(outside, 'a'),
					baselineFile: join(outside, 'baseline.json'),
					secrets: [],
				})

				expect(bare.gitState()).toEqual({
					available: false,
					baselineChangePending: false,
					dirtyFiles: [],
					dirtyCount: 0,
				})
			} finally {
				rmSync(outside, { recursive: true, force: true })
			}
		})
	})

	it('blocks the next benchmark Run until the Baseline change is committed', () => {
		store.writeBaseline('run-a', at)

		expect(() => assertCleanWorktree(repo.repoDir)).toThrow(DirtyWorktreeError)
		expect(() => assertCleanWorktree(repo.repoDir)).toThrow(/bench\/baseline\.json/)

		commit()

		expect(() => assertCleanWorktree(repo.repoDir)).not.toThrow()
	})
})
