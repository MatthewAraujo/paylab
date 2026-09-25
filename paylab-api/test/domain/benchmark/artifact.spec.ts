import {
	artifactFileName,
	artifactIdForFile,
	artifactKindOfFile,
} from '@/domain/benchmark/artifact'

describe('Artifact file naming', () => {
	it('maps each kind to its extension', () => {
		expect(artifactFileName({ id: 's-log', kind: 'LOG' })).toBe('s-log.log')
		expect(artifactFileName({ id: 's-plan', kind: 'QUERY_PLAN' })).toBe('s-plan.plan.txt')
		expect(artifactFileName({ id: 's-raw', kind: 'RAW_DATA' })).toBe('s-raw.jsonl')
	})

	it('recognizes the kind of a scenario output file, and ignores anything else', () => {
		expect(artifactKindOfFile('history.plan.txt')).toBe('QUERY_PLAN')
		expect(artifactKindOfFile('samples.jsonl')).toBe('RAW_DATA')
		expect(artifactKindOfFile('output.log')).toBe('LOG')
		expect(artifactKindOfFile('notes.bin')).toBeNull()
	})

	it('builds a safe identifier from the scenario and the file name', () => {
		expect(artifactIdForFile('t13.history', 'first page.plan.txt')).toBe('t13.history-first-page')
		expect(artifactIdForFile('t14.hot', 'raw.jsonl')).toBe('t14.hot-raw')
	})

	it('refuses a file name that cannot become a safe identifier', () => {
		expect(artifactIdForFile('s', '.plan.txt')).toBeNull()
		expect(artifactIdForFile('s', '../x.plan.txt')).toBe('s-..-x')
	})
})
