import {
	ApiKeyRecord,
	ApiKeysRepository,
} from '@/domain/paylab/application/repositories/api-keys-repository'
import { generateApiKey, hashApiKey } from '@/domain/paylab/application/services/api-key'
import { AuthenticateMerchantUseCase } from '@/domain/paylab/application/use-cases/authenticate-merchant'
import { InvalidApiKeyError } from '@/domain/paylab/application/use-cases/errors/invalid-api-key-error'

class InMemoryApiKeysRepository extends ApiKeysRepository {
	items: ApiKeyRecord[] = []
	lookups = 0

	async findByKeyHash(keyHash: string) {
		this.lookups++
		return this.items.find((item) => item.keyHash === keyHash) ?? null
	}
}

describe('AuthenticateMerchantUseCase', () => {
	let repository: InMemoryApiKeysRepository
	let sut: AuthenticateMerchantUseCase

	beforeEach(() => {
		repository = new InMemoryApiKeysRepository()
		sut = new AuthenticateMerchantUseCase(repository)
	})

	test('resolves the Merchant that owns a valid key', async () => {
		const rawKey = generateApiKey()
		repository.items.push({
			merchantId: 'merchant-a',
			keyHash: hashApiKey(rawKey),
			revokedAt: null,
		})

		const result = await sut.execute({ apiKey: rawKey })

		expect(result.isRight()).toBe(true)
		expect(result.value).toEqual({ merchantId: 'merchant-a' })
	})

	test('rejects an unknown key', async () => {
		const result = await sut.execute({ apiKey: generateApiKey() })

		expect(result.isLeft()).toBe(true)
		expect(result.value).toBeInstanceOf(InvalidApiKeyError)
	})

	test('rejects a revoked key', async () => {
		const rawKey = generateApiKey()
		repository.items.push({
			merchantId: 'merchant-a',
			keyHash: hashApiKey(rawKey),
			revokedAt: new Date(),
		})

		const result = await sut.execute({ apiKey: rawKey })

		expect(result.value).toBeInstanceOf(InvalidApiKeyError)
	})

	test('rejects an empty key without querying the repository', async () => {
		const result = await sut.execute({ apiKey: '' })

		expect(result.value).toBeInstanceOf(InvalidApiKeyError)
		expect(repository.lookups).toBe(0)
	})
})
