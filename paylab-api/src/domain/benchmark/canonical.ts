import { createHash } from 'node:crypto'

function sortKeys(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map(sortKeys)
	}
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, entry]) => entry !== undefined)
				.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
				.map(([key, entry]) => [key, sortKeys(entry)]),
		)
	}
	return value
}

// Key order never changes the text, so equal content always hashes and serializes equally.
export function canonicalJson(value: unknown, indent?: number): string {
	return JSON.stringify(sortKeys(value), null, indent)
}

export function fingerprint(value: unknown): string {
	return createHash('sha256').update(canonicalJson(value)).digest('hex')
}

export type ScenarioDefinition = {
	id: string
	protocol: Record<string, unknown>
	config: Record<string, unknown>
}

// Covers what makes two measurements comparable: the workload and how it is measured.
export function scenarioFingerprint(definition: ScenarioDefinition): string {
	return fingerprint({
		id: definition.id,
		protocol: definition.protocol,
		config: definition.config,
	})
}
