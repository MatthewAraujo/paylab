import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { atomicWrite, readState } from './store'

export interface LockRecord {
	pid: number
	runId?: string
	startedAt: string
}

export class ActiveRunError extends Error {
	constructor(
		readonly record: LockRecord,
		readonly stage: string,
	) {
		super(
			`Benchmark Run ${record.runId ?? '(starting)'} is already active (pid ${record.pid}), stage: ${stage}`,
		)
	}
}

export interface LockHandle {
	setRunId(runId: string): void
	release(): void
}

export const lockPath = (artifactRoot: string) => join(artifactRoot, 'lock.json')

// A pid that exists (even if owned by someone else) means the owner is still there.
function isAlive(pid: number): boolean {
	try {
		process.kill(pid, 0)
		return true
	} catch (error) {
		return (error as NodeJS.ErrnoException).code === 'EPERM'
	}
}

function readLock(path: string): LockRecord | null {
	try {
		const record = JSON.parse(readFileSync(path, 'utf8'))
		return typeof record?.pid === 'number' ? record : null
	} catch {
		return null
	}
}

function stageOf(artifactRoot: string, record: LockRecord): string {
	try {
		const state = record.runId ? readState(artifactRoot, record.runId) : null
		const active = state?.scenarios.find((scenario) => scenario.status === 'ACTIVE')
		return active ? `running ${active.id}` : 'starting'
	} catch {
		return 'unknown'
	}
}

/**
 * One Run at a time: the lock is created exclusively, so two invocations can never both hold
 * it. A lock whose owner process is gone is stale; `recoverStale` turns the abandoned Run
 * into an INCOMPLETE one before the lock is taken over. A live owner is never disturbed.
 */
export function acquireLock(
	artifactRoot: string,
	hooks: { recoverStale(record: LockRecord | null): void },
): LockHandle {
	const path = lockPath(artifactRoot)
	mkdirSync(artifactRoot, { recursive: true })
	const record: LockRecord = { pid: process.pid, startedAt: new Date().toISOString() }

	for (let attempt = 0; attempt < 2; attempt++) {
		try {
			writeFileSync(path, JSON.stringify(record), { flag: 'wx' })
			return {
				setRunId(runId) {
					record.runId = runId
					atomicWrite(path, JSON.stringify(record))
				},
				release() {
					if (existsSync(path) && readLock(path)?.pid === process.pid) {
						rmSync(path, { force: true })
					}
				},
			}
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
				throw error
			}
		}

		const existing = readLock(path)
		if (existing && isAlive(existing.pid)) {
			throw new ActiveRunError(existing, stageOf(artifactRoot, existing))
		}
		hooks.recoverStale(existing)
		rmSync(path, { force: true })
	}
	throw new Error(`Could not acquire the benchmark lock at ${path}`)
}
