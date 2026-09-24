import { join } from 'node:path'
import {
	CliUsageError,
	assertArtifactRootIgnored,
	collectSecrets,
	exitCodeFor,
	formatReport,
	parseCliArgs,
} from '../../scripts/benchmark/cli'
import { type TempRepo, createTempRepo } from '../support/git-repo'

describe('parseCliArgs', () => {
	it('accepts no arguments', () => {
		expect(parseCliArgs([])).toEqual({})
	})

	it('accepts an intent note in either form', () => {
		expect(parseCliArgs(['--note', 'after the index change'])).toEqual({
			note: 'after the index change',
		})
		expect(parseCliArgs(['--note=after the index change'])).toEqual({
			note: 'after the index change',
		})
	})

	it('has no way to select scenarios: every Run is the complete suite', () => {
		expect(() => parseCliArgs(['--scenario', 't14'])).toThrow(CliUsageError)
		expect(() => parseCliArgs(['--only=t13'])).toThrow(/complete/)
	})

	it('rejects a note without text', () => {
		expect(() => parseCliArgs(['--note'])).toThrow(CliUsageError)
		expect(() => parseCliArgs(['--note', '  '])).toThrow(CliUsageError)
	})
})

describe('the terminal report', () => {
	const completed = {
		summary: { runId: 'r1', status: 'COMPLETED', failure: undefined, scenarios: [] },
		files: ['bench/results/r1.json'],
		suggestedCommitMessage: 'chore(bench): publish benchmark run r1',
	} as never
	const incomplete = {
		summary: {
			runId: 'r2',
			status: 'INCOMPLETE',
			failure: { scenarioId: 'fake.b', summary: 'Scenario fake.b exited with status 3: boom' },
			scenarios: [],
		},
		files: ['bench/results/r2.json'],
		suggestedCommitMessage: 'chore(bench): publish benchmark run r2',
	} as never

	it('lists the generated files and the suggested commit message, and says nothing was committed', () => {
		const report = formatReport(completed)

		expect(report).toContain('COMPLETED')
		expect(report).toContain('bench/results/r1.json')
		expect(report).toContain('chore(bench): publish benchmark run r1')
		expect(report).toMatch(/not committed/i)
	})

	it('explains an incomplete Run and exits unsuccessfully', () => {
		expect(formatReport(incomplete)).toContain('Scenario fake.b exited with status 3: boom')
		expect(exitCodeFor(incomplete)).toBe(1)
		expect(exitCodeFor(completed)).toBe(0)
	})
})

describe('assertArtifactRootIgnored', () => {
	let repo: TempRepo

	beforeEach(() => {
		repo = createTempRepo()
	})
	afterEach(() => repo.cleanup())

	it('accepts an ignored Artifact root inside the repository', () => {
		expect(() => assertArtifactRootIgnored(repo.repoDir, repo.artifactRoot)).not.toThrow()
	})

	it('refuses an Artifact root that Git would report as changes', () => {
		expect(() => assertArtifactRootIgnored(repo.repoDir, join(repo.repoDir, 'artifacts'))).toThrow(
			/ignored/,
		)
	})

	it('accepts an Artifact root outside the repository', () => {
		expect(() => assertArtifactRootIgnored(repo.repoDir, '/var/tmp/paylab-artifacts')).not.toThrow()
	})
})

describe('collectSecrets', () => {
	it('collects database URLs and values of sensitive names, and nothing else', () => {
		const secrets = collectSecrets({
			BENCH_DATABASE_URL: 'postgresql://paylab:pw@localhost:5433/paylab_bench',
			DATABASE_URL: 'postgresql://paylab:pw2@localhost:5432/paylab',
			API_TOKEN: 'tok-123',
			DB_PASSWORD: 'hunter2',
			PORT: '3333',
			NODE_ENV: 'development',
			EMPTY_SECRET: '',
		})

		expect(secrets.sort()).toEqual(
			[
				'hunter2',
				'postgresql://paylab:pw2@localhost:5432/paylab',
				'postgresql://paylab:pw@localhost:5433/paylab_bench',
				'tok-123',
			].sort(),
		)
	})
})
