import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	ImportSourceError,
	parseCorrectness,
	parseDepthTable,
	parseLoadLines,
	parseQueryTable,
} from '../../../scripts/benchmark/import/sources'

const real = (file: string) =>
	readFileSync(join(process.cwd(), 'docs/experiments/raw', file), 'utf8')

describe('parseQueryTable (T13 suite output)', () => {
	const text = [
		'### Final adopted',
		'',
		'| query | median ms | top plan node |',
		'| --- | ---: | --- |',
		'| history first page (hot wallet) | 0.108 | ->  Index Scan using ledger_entries_account_created_id_idx on ledger_entries |',
		'| report 90d (hot merchant) | 31.849 | ->  HashAggregate |',
	].join('\n')

	it('reads the label, the median latency, and the top plan node of each row', () => {
		expect(parseQueryTable(text, 't.txt')).toEqual([
			{
				label: 'history first page (hot wallet)',
				medianMs: 0.108,
				topNode: '->  Index Scan using ledger_entries_account_created_id_idx on ledger_entries',
			},
			{ label: 'report 90d (hot merchant)', medianMs: 31.849, topNode: '->  HashAggregate' },
		])
	})

	it('reads the real recorded tables completely', () => {
		expect(parseQueryTable(real('final-adopted.txt'), 'final-adopted.txt')).toHaveLength(23)
		const baseline = parseQueryTable(real('final-base.txt'), 'final-base.txt')
		expect(baseline).toHaveLength(23)
		expect(baseline[0]).toMatchObject({
			label: 'history first page (hot wallet)',
			medianMs: 57.742,
		})
	})

	it('names the file and line of a row it cannot read', () => {
		const broken = text.replace('31.849', 'fast')

		expect(() => parseQueryTable(broken, 'final-adopted.txt')).toThrow(ImportSourceError)
		expect(() => parseQueryTable(broken, 'final-adopted.txt')).toThrow(/final-adopted\.txt:6/)
	})

	it('refuses a table with no rows or a row with the wrong number of cells', () => {
		expect(() => parseQueryTable('### empty\n', 'e.txt')).toThrow(/no rows/)
		expect(() => parseQueryTable('| a | 1 |\n', 'e.txt')).toThrow(/3 cells/)
	})
})

describe('parseDepthTable (T13 keyset versus offset)', () => {
	it('reads the real depth table', () => {
		const rows = parseDepthTable(real('depth-adopted.txt'), 'depth-adopted.txt')

		expect(rows.map((r) => r.depth)).toEqual([0, 1000, 10000, 50000, 90000])
		expect(rows[3]).toMatchObject({ depth: 50000, keysetMs: 0.137, offsetMs: 77.938 })
	})

	it('refuses a row without a numeric depth', () => {
		expect(() => parseDepthTable('| x | 1 | 2 | a | b |\n', 'd.txt')).toThrow(/depth/)
	})
})

describe('parseLoadLines (T14 driver output)', () => {
	it('reads all 240 recorded lines', () => {
		const lines = parseLoadLines(real('T14-load.jsonl'), 'T14-load.jsonl')

		expect(lines).toHaveLength(240)
		expect(lines[0]).toMatchObject({
			shape: 'H',
			clients: 4,
			strategy: 'forupdate',
			rep: 1,
			sync: 'off',
			windowS: 10,
			tps: 109.4,
			pgRollbacks: 0,
		})
	})

	it('names the line of malformed JSON, a missing field, or an unknown strategy', () => {
		const good = real('T14-load.jsonl').split('\n')[0]
		const without = JSON.stringify({ ...JSON.parse(good), tps: undefined })
		const alien = JSON.stringify({ ...JSON.parse(good), strategy: 'magic' })

		expect(() => parseLoadLines(`${good}\n{not json`, 'x.jsonl')).toThrow(/x\.jsonl:2/)
		expect(() => parseLoadLines(without, 'x.jsonl')).toThrow(/tps/)
		expect(() => parseLoadLines(alien, 'x.jsonl')).toThrow(/strategy/)
	})
})

describe('parseCorrectness (T14 correctness record)', () => {
	it('reads the recorded outcome of the five strategies and the elapsed time', () => {
		const record = parseCorrectness(real('T14-correctness.txt'), 'T14-correctness.txt')

		expect(record.elapsedMs).toBe((15 * 60 + 46) * 1000)
		expect(record.results.map((r) => r.strategy)).toEqual([
			'nokey',
			'forupdate',
			'serializable',
			'optimistic',
			'advisory',
		])
		const byName = Object.fromEntries(record.results.map((r) => [r.strategy, r]))
		expect(byName.forupdate.failures).toEqual(['S3: 3413 deadlocks'])
		expect(byName.forupdate.deadlocks).toBe(3413)
		expect(byName.serializable.retries).toBe(409 + 1161 + 2703 + 2528)
		expect(byName.nokey.failures).toEqual([])
	})

	it('refuses a record that lacks a strategy, the elapsed time, or is inconsistent', () => {
		const text = real('T14-correctness.txt')

		expect(() => parseCorrectness(text.replace(/^PASS advisory.*\n/m, ''), 'c.txt')).toThrow(
			/advisory/,
		)
		expect(() => parseCorrectness(text.replace(/^elapsed.*$/m, ''), 'c.txt')).toThrow(/elapsed/)
		expect(() =>
			parseCorrectness(text.replace('FAIL forupdate', 'PASS forupdate'), 'c.txt'),
		).toThrow(/forupdate/)
	})
})
