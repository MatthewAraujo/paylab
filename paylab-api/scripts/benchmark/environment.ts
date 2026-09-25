import { cpus, totalmem } from 'node:os'
import { fingerprint } from '@/domain/benchmark/canonical'

/**
 * The environment is described by an allowlist of hardware and runtime facts. The process
 * environment is never copied, so a secret in it cannot end up in a versioned Summary.
 * `extra` carries facts the suite itself knows (PostgreSQL version and settings, ...).
 */
export function captureEnvironment(extra: Record<string, string> = {}) {
	const details: Record<string, string> = {
		node: process.versions.node,
		platform: process.platform,
		arch: process.arch,
		cpuModel: cpus()[0]?.model ?? 'unknown',
		cpuCount: String(cpus().length),
		memoryGb: String(Math.round(totalmem() / 1024 ** 3)),
		...extra,
	}
	return { fingerprint: fingerprint(details), details }
}
