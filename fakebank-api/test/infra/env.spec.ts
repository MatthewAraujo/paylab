import { buildEnv } from '@/infra/env/env'

const DATABASE_URL = 'postgresql://fakebank:fakebank@localhost:5434/fakebank'
const HASH_A = 'a'.repeat(64)
const HASH_B = '0123456789abcdef'.repeat(4)

// Configuration: the service must refuse to boot half-configured, and say why.
describe('environment configuration', () => {
	it('refuses to boot without DATABASE_URL, naming the missing variable', () => {
		expect(() => buildEnv({ NODE_ENV: 'development' })).toThrow(/DATABASE_URL/)
	})

	it('defaults PORT to 4000 so FakeBank never collides with PayLab on 3333', () => {
		const env = buildEnv({ DATABASE_URL, FAKEBANK_CLIENTS: `paylab:${HASH_A}` })

		expect(env.PORT).toBe(4000)
	})

	// AC-34: Clients are configured by the SHA-256 hash of their key, never the key itself.
	it('parses FAKEBANK_CLIENTS into client ids and key hashes', () => {
		const env = buildEnv({ DATABASE_URL, FAKEBANK_CLIENTS: ` paylab:${HASH_A} , other:${HASH_B}` })

		expect(env.FAKEBANK_CLIENTS).toEqual([
			{ clientId: 'paylab', keyHash: HASH_A },
			{ clientId: 'other', keyHash: HASH_B },
		])
	})

	// AC-34: a plaintext key or a typo must fail loudly at boot, not lock every Client out later.
	it.each([
		['missing', undefined],
		['empty', ''],
		['an entry without a hash', 'paylab'],
		['a plaintext key instead of a hash', 'paylab:dev-key-not-a-hash'],
		['a hash that is too short', `paylab:${'a'.repeat(63)}`],
		['a non-hex hash', `paylab:${'g'.repeat(64)}`],
		['an empty client id', `:${HASH_A}`],
		['a duplicated client id', `paylab:${HASH_A},paylab:${HASH_B}`],
		['a duplicated key hash', `paylab:${HASH_A},other:${HASH_A}`],
	])('refuses to boot with %s FAKEBANK_CLIENTS', (_case, value) => {
		expect(() => buildEnv({ DATABASE_URL, FAKEBANK_CLIENTS: value })).toThrow(/FAKEBANK_CLIENTS/)
	})
})
