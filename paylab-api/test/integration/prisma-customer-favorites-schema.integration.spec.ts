import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()

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

async function createStoreCustomerAndProduct(suffix: string) {
	const store = await prisma.store.create({
		data: { name: `Quintal ${suffix}`, slug: `quintal-favorites-${suffix}` },
	})
	const storeCustomer = await prisma.storeCustomer.create({
		data: {
			storeId: store.id,
			customerProfileId: `customer-profile-${suffix}`,
			email: `customer-${suffix}@example.com`,
		},
	})
	const product = await prisma.product.create({
		data: {
			storeId: store.id,
			name: `Produto ${suffix}`,
			slug: `produto-favorito-${suffix}`,
		},
	})

	return { store, storeCustomer, product }
}

describe('Prisma CustomerFavorite schema invariants', () => {
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

	test('creates a CustomerFavorite row for a valid (storeCustomerId, productId) pair', async () => {
		const { storeCustomer, product } = await createStoreCustomerAndProduct('a')

		const favorite = await prisma.customerFavorite.create({
			data: {
				storeCustomerId: storeCustomer.id,
				productId: product.id,
			},
		})

		expect(favorite.storeCustomerId).toBe(storeCustomer.id)
		expect(favorite.productId).toBe(product.id)
	})

	test('rejects a duplicate (storeCustomerId, productId) pair', async () => {
		const { storeCustomer, product } = await createStoreCustomerAndProduct('b')

		await prisma.customerFavorite.create({
			data: {
				storeCustomerId: storeCustomer.id,
				productId: product.id,
			},
		})

		await expect(
			prisma.customerFavorite.create({
				data: {
					storeCustomerId: storeCustomer.id,
					productId: product.id,
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })
	})

	test('deleting the parent StoreCustomer cascades and removes its CustomerFavorite rows', async () => {
		const { storeCustomer, product } = await createStoreCustomerAndProduct('c')

		await prisma.customerFavorite.create({
			data: {
				storeCustomerId: storeCustomer.id,
				productId: product.id,
			},
		})

		await prisma.storeCustomer.delete({ where: { id: storeCustomer.id } })

		const remaining = await prisma.customerFavorite.findMany({
			where: { storeCustomerId: storeCustomer.id },
		})
		expect(remaining).toHaveLength(0)
	})

	test('deleting the parent Product cascades and removes referencing CustomerFavorite rows', async () => {
		const { storeCustomer, product } = await createStoreCustomerAndProduct('d')

		await prisma.customerFavorite.create({
			data: {
				storeCustomerId: storeCustomer.id,
				productId: product.id,
			},
		})

		await prisma.product.delete({ where: { id: product.id } })

		const remaining = await prisma.customerFavorite.findMany({
			where: { productId: product.id },
		})
		expect(remaining).toHaveLength(0)
	})
})
