import {
	API_KEY_PREFIX,
	generateApiKey,
	hashApiKey,
	hashesMatch,
} from '@/domain/paylab/application/services/api-key'

describe('API key generation and hashing', () => {
	test('a generated key has a recognizable prefix and enough entropy', () => {
		const key = generateApiKey()

		expect(key.startsWith(API_KEY_PREFIX)).toBe(true)
		// 32 random bytes encoded as base64url are 43 characters (256 bits).
		expect(key.length - API_KEY_PREFIX.length).toBeGreaterThanOrEqual(43)
	})

	test('generated keys are unique', () => {
		const keys = new Set(Array.from({ length: 100 }, () => generateApiKey()))

		expect(keys.size).toBe(100)
	})

	test('hashing is deterministic', () => {
		const key = generateApiKey()

		expect(hashApiKey(key)).toBe(hashApiKey(key))
		expect(hashApiKey(key)).not.toBe(hashApiKey(generateApiKey()))
	})

	test('the hash never equals or contains the raw key', () => {
		const key = generateApiKey()
		const hash = hashApiKey(key)

		expect(hash).not.toBe(key)
		expect(hash).not.toContain(key)
	})

	test('hashesMatch compares hashes and tolerates different lengths', () => {
		const hash = hashApiKey(generateApiKey())

		expect(hashesMatch(hash, hash)).toBe(true)
		expect(hashesMatch(hash, hashApiKey(generateApiKey()))).toBe(false)
		expect(hashesMatch(hash, 'short')).toBe(false)
	})
})
