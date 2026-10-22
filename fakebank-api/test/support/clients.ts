import { createHash } from 'node:crypto'

// Test-only Clients. Their plaintext keys exist only here; the app sees only their hashes
// (FAKEBANK_CLIENTS, set in setup-env.ts), exactly as in production configuration.
export const TEST_CLIENTS = {
	paylab: { clientId: 'paylab', apiKey: 'test-key-paylab' },
	other: { clientId: 'other-client', apiKey: 'test-key-other-client' },
} as const

export function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex')
}

export const TEST_FAKEBANK_CLIENTS = Object.values(TEST_CLIENTS)
	.map(({ clientId, apiKey }) => `${clientId}:${sha256Hex(apiKey)}`)
	.join(',')

export function bearer(client: { apiKey: string }): string {
	return `Bearer ${client.apiKey}`
}
