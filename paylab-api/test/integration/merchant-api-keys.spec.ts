import { generateApiKey, hashApiKey } from '@/domain/paylab/application/services/api-key'
import { Merchant } from '@/domain/paylab/enterprise/entities/merchant'
import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaApiKeysRepository } from '@/infra/database/repositories/prisma-api-keys-repository'
import { PrismaMerchantsRepository } from '@/infra/database/repositories/prisma-merchants-repository'
import { provisionMerchant } from '../../scripts/provision-merchant'
import { prisma } from '../support/database'

describe('Merchant and API key repositories', () => {
	const service = new PrismaService()
	const merchants = new PrismaMerchantsRepository(service)
	const apiKeys = new PrismaApiKeysRepository(service)

	afterAll(async () => {
		await service.$disconnect()
	})

	test('stores only the hash of the key', async () => {
		const rawKey = generateApiKey()
		const merchant = Merchant.create({ name: 'Acme' })

		await merchants.createWithApiKey(merchant, hashApiKey(rawKey))

		const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
			SELECT * FROM merchant_api_keys WHERE merchant_id = ${merchant.id.toString()}::uuid`
		expect(rows).toHaveLength(1)
		expect(rows[0].key_hash).toBe(hashApiKey(rawKey))
		expect(
			JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? v.toString() : v)),
		).not.toContain(rawKey)
		const merchantRows = await prisma.$queryRaw<unknown[]>`SELECT * FROM merchants`
		expect(JSON.stringify(merchantRows)).not.toContain(rawKey)
	})

	test('lookup by hash resolves the owning Merchant', async () => {
		const rawKey = generateApiKey()
		const merchant = Merchant.create({ name: 'Acme' })
		await merchants.createWithApiKey(merchant, hashApiKey(rawKey))

		const record = await apiKeys.findByKeyHash(hashApiKey(rawKey))

		expect(record).toEqual({
			merchantId: merchant.id.toString(),
			keyHash: hashApiKey(rawKey),
			revokedAt: null,
		})
	})

	test('an unknown hash resolves nothing', async () => {
		expect(await apiKeys.findByKeyHash(hashApiKey(generateApiKey()))).toBeNull()
	})

	test('the key of one Merchant never resolves to another', async () => {
		const keyA = generateApiKey()
		const keyB = generateApiKey()
		const merchantA = Merchant.create({ name: 'A' })
		const merchantB = Merchant.create({ name: 'B' })
		await merchants.createWithApiKey(merchantA, hashApiKey(keyA))
		await merchants.createWithApiKey(merchantB, hashApiKey(keyB))

		expect((await apiKeys.findByKeyHash(hashApiKey(keyA)))?.merchantId).toBe(
			merchantA.id.toString(),
		)
		expect((await apiKeys.findByKeyHash(hashApiKey(keyB)))?.merchantId).toBe(
			merchantB.id.toString(),
		)
	})

	test('a revoked key is returned with its revocation date', async () => {
		const rawKey = generateApiKey()
		const merchant = Merchant.create({ name: 'Acme' })
		await merchants.createWithApiKey(merchant, hashApiKey(rawKey))
		await prisma.$executeRaw`UPDATE merchant_api_keys SET revoked_at = now()`

		const record = await apiKeys.findByKeyHash(hashApiKey(rawKey))

		expect(record?.revokedAt).toBeInstanceOf(Date)
	})
})

describe('Provisioning script', () => {
	test('running it twice creates two distinct Merchants and prints each key once', async () => {
		const service = new PrismaService()
		const first: string[] = []
		const second: string[] = []

		try {
			await provisionMerchant(['Acme'], service, (line) => first.push(line))
			await provisionMerchant(['Acme'], service, (line) => second.push(line))
		} finally {
			await service.$disconnect()
		}

		const merchants = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM merchants`
		expect(merchants).toHaveLength(2)

		const keyPattern = /pk_[A-Za-z0-9_-]{43,}/g
		const firstKeys = first.join('\n').match(keyPattern) ?? []
		const secondKeys = second.join('\n').match(keyPattern) ?? []
		expect(firstKeys).toHaveLength(1)
		expect(secondKeys).toHaveLength(1)
		expect(firstKeys[0]).not.toBe(secondKeys[0])

		// The database holds only the hash of each printed key, never the key itself.
		const stored = await prisma.$queryRaw<
			{ key_hash: string }[]
		>`SELECT key_hash FROM merchant_api_keys`
		expect(stored.map((row) => row.key_hash).sort()).toEqual(
			[hashApiKey(firstKeys[0] as string), hashApiKey(secondKeys[0] as string)].sort(),
		)
	})

	test('refuses to run without a Merchant name', async () => {
		const service = new PrismaService()
		const out: string[] = []

		try {
			const ok = await provisionMerchant([], service, (line) => out.push(line))
			expect(ok).toBe(false)
		} finally {
			await service.$disconnect()
		}

		const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM merchants`
		expect(count).toBe(0n)
	})
})
