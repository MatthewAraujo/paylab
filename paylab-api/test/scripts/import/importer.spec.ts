import {
	cpSync,
	existsSync,
	mkdirSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseSummary } from '@/domain/benchmark/summary'
import {
	ImportConflictError,
	importLegacyEvidence,
} from '../../../scripts/benchmark/import/importer'
import { EVIDENCE } from '../../../scripts/benchmark/import/manifest'
import { ImportSourceError } from '../../../scripts/benchmark/import/sources'

const RUN_FILES = [
	'imported-t13-step1-baseline.json',
	'imported-t13-step2-adopted.json',
	'imported-t14-load-v2.json',
]

describe('importLegacyEvidence', () => {
	let root: string
	let summaryDir: string

	// A copy of the real evidence files, so a test can damage a source without touching the repository.
	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'paylab-import-'))
		summaryDir = join(root, 'bench', 'results')
		for (const file of Object.values(EVIDENCE)) {
			mkdirSync(dirname(join(root, file)), { recursive: true })
			cpSync(join(process.cwd(), file), join(root, file))
		}
	})
	afterEach(() => rmSync(root, { recursive: true, force: true }))

	const written = () => (existsSync(summaryDir) ? readdirSync(summaryDir).sort() : [])

	it('publishes the three imported Runs as valid, versionable Summaries', () => {
		const result = importLegacyEvidence({ rootDir: root, summaryDir })

		expect(result.written).toEqual(RUN_FILES)
		expect(result.unchanged).toEqual([])
		expect(written()).toEqual(RUN_FILES)
		for (const file of RUN_FILES) {
			const text = readFileSync(join(summaryDir, file), 'utf8')
			const parsed = parseSummary(JSON.parse(text))
			expect(parsed.isRight(), file).toBe(true)
			expect(text.endsWith('}\n')).toBe(true)
		}
	})

	it('changes nothing when run again', () => {
		importLegacyEvidence({ rootDir: root, summaryDir })
		const before = RUN_FILES.map((f) => readFileSync(join(summaryDir, f), 'utf8'))

		const again = importLegacyEvidence({ rootDir: root, summaryDir })

		expect(again.written).toEqual([])
		expect(again.unchanged).toEqual(RUN_FILES)
		expect(RUN_FILES.map((f) => readFileSync(join(summaryDir, f), 'utf8'))).toEqual(before)
	})

	it('produces byte-identical files wherever it runs', () => {
		const other = join(root, 'other-results')
		importLegacyEvidence({ rootDir: root, summaryDir })
		importLegacyEvidence({ rootDir: root, summaryDir: other })

		for (const file of RUN_FILES) {
			expect(readFileSync(join(other, file), 'utf8')).toBe(
				readFileSync(join(summaryDir, file), 'utf8'),
			)
		}
	})

	it('never overwrites a published Summary that differs, and writes nothing else', () => {
		mkdirSync(summaryDir, { recursive: true })
		const tampered = join(summaryDir, 'imported-t13-step2-adopted.json')
		writeFileSync(tampered, '{"edited":true}\n')

		expect(() => importLegacyEvidence({ rootDir: root, summaryDir })).toThrow(ImportConflictError)

		expect(readFileSync(tampered, 'utf8')).toBe('{"edited":true}\n')
		expect(written()).toEqual(['imported-t13-step2-adopted.json'])
	})

	it('fails without any partial output when a source is malformed', () => {
		const table = join(root, EVIDENCE.t13AdoptedQueries)
		writeFileSync(table, readFileSync(table, 'utf8').replace('0.108', 'fast'))

		expect(() => importLegacyEvidence({ rootDir: root, summaryDir })).toThrow(ImportSourceError)
		expect(() => importLegacyEvidence({ rootDir: root, summaryDir })).toThrow(/final-adopted\.txt/)
		expect(written()).toEqual([])
	})

	it('names an evidence file that is missing', () => {
		rmSync(join(root, EVIDENCE.t13AdoptedQueryPlans))

		expect(() => importLegacyEvidence({ rootDir: root, summaryDir })).toThrow(
			/plans\/final-adopted\.txt/,
		)
		expect(written()).toEqual([])
	})
})
