import type { CorrectnessResult } from '../../../bench/exp/strategies/correctness'
import { STRATEGIES, type Strategy } from '../../../bench/exp/strategies/strategies'
import type { LoadLine } from '../../../bench/scenarios/t14-matrix'

// Readers for the structured legacy evidence: the tables printed by the T13 helper scripts, the
// JSON lines of the T14 load driver, and the T14 correctness record. Prose is never read. A source
// that cannot be read fails loudly with its file and line, so no partial import can be published.

export class ImportSourceError extends Error {
	constructor(file: string, message: string, line?: number) {
		super(`${file}${line ? `:${line}` : ''}: ${message}`)
	}
}

function tableRows(text: string) {
	return text
		.split('\n')
		.map((raw, index) => ({ raw, line: index + 1 }))
		.filter(({ raw }) => raw.startsWith('|'))
		.map(({ raw, line }) => ({
			line,
			cells: raw
				.split('|')
				.slice(1, -1)
				.map((cell) => cell.trim()),
		}))
		.filter(
			({ cells }) =>
				cells[0] !== 'query' && !cells[0].startsWith('depth') && !/^:?-+:?$/.test(cells[0]),
		)
}

function numeric(file: string, line: number, name: string, value: string): number {
	const parsed = Number(value)
	if (value === '' || !Number.isFinite(parsed)) {
		throw new ImportSourceError(file, `${name} "${value}" is not a number`, line)
	}
	return parsed
}

export interface QueryRow {
	label: string
	medianMs: number
	topNode: string
}

export function parseQueryTable(text: string, file: string): QueryRow[] {
	const rows = tableRows(text).map(({ cells, line }) => {
		if (cells.length !== 3) {
			throw new ImportSourceError(file, `expected 3 cells, found ${cells.length}`, line)
		}
		return {
			label: cells[0],
			medianMs: numeric(file, line, 'median', cells[1]),
			topNode: cells[2],
		}
	})
	if (rows.length === 0) {
		throw new ImportSourceError(file, 'no rows found')
	}
	return rows
}

export interface DepthRow {
	depth: number
	keysetMs: number
	offsetMs: number
	keysetNode: string
	offsetNode: string
}

export function parseDepthTable(text: string, file: string): DepthRow[] {
	const rows = tableRows(text).map(({ cells, line }) => {
		if (cells.length !== 5) {
			throw new ImportSourceError(file, `expected 5 cells, found ${cells.length}`, line)
		}
		return {
			depth: numeric(file, line, 'depth', cells[0]),
			keysetMs: numeric(file, line, 'keyset ms', cells[1]),
			offsetMs: numeric(file, line, 'offset ms', cells[2]),
			keysetNode: cells[3],
			offsetNode: cells[4],
		}
	})
	if (rows.length === 0) {
		throw new ImportSourceError(file, 'no rows found')
	}
	return rows
}

const LOAD_NUMBERS = [
	'clients',
	'rep',
	'windowS',
	'tps',
	'debitTps',
	'creditTps',
	'p50',
	'p95',
	'p99',
	'debitP50',
	'debitP95',
	'debitP99',
	'creditP50',
	'creditP95',
	'creditP99',
	'attemptsPerSuccess',
	'serializationFailures',
	'versionConflicts',
	'deadlocks',
	'exhausted',
	'errors',
	'failedPayments',
	'acquireMeanMs',
	'acquireP95Ms',
	'avgLockWaiters',
	'samples',
] as const

export function parseLoadLines(text: string, file: string): LoadLine[] {
	const lines = text
		.split('\n')
		.map((raw, index) => ({ raw, line: index + 1 }))
		.filter(({ raw }) => raw.trim().length > 0)
	if (lines.length === 0) {
		throw new ImportSourceError(file, 'no lines found')
	}

	return lines.map(({ raw, line }) => {
		let value: Record<string, unknown>
		try {
			value = JSON.parse(raw)
		} catch {
			throw new ImportSourceError(file, 'not valid JSON', line)
		}
		for (const field of LOAD_NUMBERS) {
			if (typeof value[field] !== 'number') {
				throw new ImportSourceError(file, `field "${field}" is missing or not a number`, line)
			}
		}
		for (const field of ['pgRollbacks', 'pgDeadlocks']) {
			if (value[field] !== null && typeof value[field] !== 'number') {
				throw new ImportSourceError(file, `field "${field}" is missing or not a number`, line)
			}
		}
		if (!['H', 'W', 'M'].includes(value.shape as string)) {
			throw new ImportSourceError(file, `unknown shape "${value.shape}"`, line)
		}
		if (!STRATEGIES.includes(value.strategy as Strategy)) {
			throw new ImportSourceError(file, `unknown strategy "${value.strategy}"`, line)
		}
		if (value.sync !== 'on' && value.sync !== 'off') {
			throw new ImportSourceError(file, `unknown sync mode "${value.sync}"`, line)
		}
		return value as unknown as LoadLine
	})
}

export interface CorrectnessRecord {
	results: CorrectnessResult[]
	elapsedMs: number
}

export function parseCorrectness(text: string, file: string): CorrectnessRecord {
	const results: CorrectnessResult[] = []
	let elapsedMs: number | undefined

	const rows = text.split('\n').map((raw, index) => ({ raw, line: index + 1 }))
	for (const [at, { raw, line }] of rows.entries()) {
		const header = /^(PASS|FAIL) (\w+)\s+(.*)$/.exec(raw)
		if (header) {
			const [, verdict, name, details] = header
			if (!STRATEGIES.includes(name as Strategy)) {
				throw new ImportSourceError(file, `unknown strategy "${name}"`, line)
			}
			const failures: string[] = []
			for (const next of rows.slice(at + 1)) {
				const failure = /^ {3}- (.*)$/.exec(next.raw)
				if (!failure) break
				failures.push(failure[1])
			}
			if ((verdict === 'FAIL') !== failures.length > 0) {
				throw new ImportSourceError(
					file,
					`${name}: verdict ${verdict} disagrees with its failure lines`,
					line,
				)
			}
			const retries = [...details.matchAll(/S\d retries=(\d+)/g)].reduce(
				(sum, m) => sum + Number(m[1]),
				0,
			)
			const deadlocks = Number(/S3 retries=\d+ deadlocks=(\d+)/.exec(details)?.[1] ?? Number.NaN)
			if (!Number.isFinite(deadlocks)) {
				throw new ImportSourceError(file, `${name}: no crossed-transfer deadlock count`, line)
			}
			results.push({
				strategy: name as Strategy,
				failures,
				notes: details.split(/\s{2,}/),
				retries,
				deadlocks,
			})
			continue
		}
		const elapsed = /^elapsed (\d+)m(\d+)s/.exec(raw)
		if (elapsed) {
			elapsedMs = (Number(elapsed[1]) * 60 + Number(elapsed[2])) * 1000
		}
	}

	for (const strategy of STRATEGIES) {
		if (!results.some((result) => result.strategy === strategy)) {
			throw new ImportSourceError(file, `no result for strategy ${strategy}`)
		}
	}
	if (elapsedMs === undefined) {
		throw new ImportSourceError(file, 'no elapsed time recorded')
	}
	return { results, elapsedMs }
}
