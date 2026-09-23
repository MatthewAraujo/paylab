import { CustomerFavoritesRepository } from '@/domain/quintalpet/application/repositories/customer-favorites-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCustomerFavoritesRepository } from '@/infra/database/prisma/repositories/customers/prisma-customer-favorites-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const favoritesRepository: CustomerFavoritesRepository = new PrismaCustomerFavoritesRepository(
	prisma,
)

async function resetDatabase() {
	await prisma.customerFavorite.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.attachment.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

async function createStoreCustomer(suffix: string) {
	const store = await prisma.store.create({
		data: { name: `Quintal ${suffix}`, slug: `quintal-fav-repo-${suffix}` },
	})
	return prisma.storeCustomer.create({
		data: {
			storeId: store.id,
			customerProfileId: `customer-profile-${suffix}`,
			email: `customer-${suffix}@example.com`,
		},
	})
}

async function createProduct(
	storeId: string,
	slug: string,
	status: 'ACTIVE' | 'DRAFT' | 'INACTIVE' | 'ARCHIVED' = 'ACTIVE',
) {
	return prisma.product.create({
		data: {
			storeId,
			name: `Produto ${slug}`,
			slug,
			status,
		},
	})
}

describe('PrismaCustomerFavoritesRepository', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('listVisibleProductIds returns only ids whose product status is ACTIVE', async () => {
		const storeCustomer = await createStoreCustomer('a')
		const active = await createProduct(storeCustomer.storeId, 'ativo-a', 'ACTIVE')
		const archived = await createProduct(storeCustomer.storeId, 'arquivado-a', 'ARCHIVED')

		await prisma.customerFavorite.createMany({
			data: [
				{ storeCustomerId: storeCustomer.id, productId: active.id },
				{ storeCustomerId: storeCustomer.id, productId: archived.id },
			],
		})

		const visible = await favoritesRepository.listVisibleProductIds(storeCustomer.id)

		expect(visible).toEqual([active.id])
	})

	test('replaceVisibleFavorites removes visible favorites absent from the incoming list, preserves hidden favorites, and adds new ones', async () => {
		const storeCustomer = await createStoreCustomer('b')
		const productA = await createProduct(storeCustomer.storeId, 'produto-a', 'ACTIVE')
		const productB = await createProduct(storeCustomer.storeId, 'produto-b', 'ACTIVE')
		const productC = await createProduct(storeCustomer.storeId, 'produto-c', 'ARCHIVED')
		const productD = await createProduct(storeCustomer.storeId, 'produto-d', 'ACTIVE')

		await prisma.customerFavorite.createMany({
			data: [
				{ storeCustomerId: storeCustomer.id, productId: productA.id },
				{ storeCustomerId: storeCustomer.id, productId: productB.id },
				{ storeCustomerId: storeCustomer.id, productId: productC.id },
			],
		})

		await favoritesRepository.replaceVisibleFavorites(storeCustomer.id, [productB.id, productD.id])

		const allRemaining = await prisma.customerFavorite.findMany({
			where: { storeCustomerId: storeCustomer.id },
			select: { productId: true },
		})

		expect(allRemaining.map((row) => row.productId).sort()).toEqual(
			[productB.id, productC.id, productD.id].sort(),
		)

		// calling it again with the same incoming list is idempotent
		await expect(
			favoritesRepository.replaceVisibleFavorites(storeCustomer.id, [productB.id, productD.id]),
		).resolves.not.toThrow()

		const afterSecondCall = await prisma.customerFavorite.findMany({
			where: { storeCustomerId: storeCustomer.id },
			select: { productId: true },
		})
		expect(afterSecondCall.map((row) => row.productId).sort()).toEqual(
			[productB.id, productC.id, productD.id].sort(),
		)
	})

	test('addFavorite is idempotent', async () => {
		const storeCustomer = await createStoreCustomer('c')
		const product = await createProduct(storeCustomer.storeId, 'produto-idempotente', 'ACTIVE')

		await favoritesRepository.addFavorite(storeCustomer.id, product.id)
		await expect(
			favoritesRepository.addFavorite(storeCustomer.id, product.id),
		).resolves.not.toThrow()

		const rows = await prisma.customerFavorite.findMany({
			where: { storeCustomerId: storeCustomer.id, productId: product.id },
		})
		expect(rows).toHaveLength(1)
	})

	test('removeFavorite is a no-op when the favorite does not exist', async () => {
		const storeCustomer = await createStoreCustomer('d')
		const product = await createProduct(storeCustomer.storeId, 'produto-inexistente', 'ACTIVE')

		await expect(
			favoritesRepository.removeFavorite(storeCustomer.id, product.id),
		).resolves.not.toThrow()

		const rows = await prisma.customerFavorite.findMany({
			where: { storeCustomerId: storeCustomer.id, productId: product.id },
		})
		expect(rows).toHaveLength(0)
	})
})
