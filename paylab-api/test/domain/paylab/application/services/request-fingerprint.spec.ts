import { requestFingerprint } from '@/domain/paylab/application/services/request-fingerprint'

const base = {
	sourceAccountId: '5b0b6d0e-7c5e-4d3e-9d0a-000000000001',
	destinationAccountId: '5b0b6d0e-7c5e-4d3e-9d0a-000000000002',
	amount: 100,
	currency: 'BRL',
}

describe('requestFingerprint', () => {
	test('is deterministic', () => {
		expect(requestFingerprint(base)).toBe(requestFingerprint({ ...base }))
	})

	test('normalizes the case of account ids', () => {
		expect(requestFingerprint(base)).toBe(
			requestFingerprint({
				...base,
				sourceAccountId: base.sourceAccountId.toUpperCase(),
			}),
		)
	})

	test.each([
		['source', { sourceAccountId: '5b0b6d0e-7c5e-4d3e-9d0a-000000000003' }],
		['destination', { destinationAccountId: '5b0b6d0e-7c5e-4d3e-9d0a-000000000003' }],
		['amount', { amount: 101 }],
		['currency', { currency: 'USD' }],
	])('changes when the %s changes', (_field, change) => {
		expect(requestFingerprint({ ...base, ...change })).not.toBe(requestFingerprint(base))
	})

	test('does not confuse swapped source and destination', () => {
		expect(
			requestFingerprint({
				...base,
				sourceAccountId: base.destinationAccountId,
				destinationAccountId: base.sourceAccountId,
			}),
		).not.toBe(requestFingerprint(base))
	})
})
