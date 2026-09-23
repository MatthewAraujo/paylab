import { CustomerFavoritesRepository } from '@/domain/quintalpet/application/repositories/customer-favorites-repository'
import { AddFavoriteProductUseCase } from '@/domain/quintalpet/application/use-cases/add-favorite-product'
import { FavoriteProductNotAvailableError } from '@/domain/quintalpet/application/use-cases/errors/favorite-product-not-available-error'
import { GetFavoriteProductSlugsUseCase } from '@/domain/quintalpet/application/use-cases/get-favorite-product-slugs'
import { RemoveFavoriteProductUseCase } from '@/domain/quintalpet/application/use-cases/remove-favorite-product'
import { ReplaceFavoriteProductSlugsUseCase } from '@/domain/quintalpet/application/use-cases/replace-favorite-product-slugs'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogProductsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-products-repository'
import { PrismaCustomerFavoritesRepository } from '@/infra/database/prisma/repositories/customers/prisma-customer-favorites-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const catalogProductsRepository = new PrismaCatalogProductsRepository(prisma)
const favoritesRepository: CustomerFavoritesRepository = new PrismaCustomerFavoritesRepository(
	prisma,
)

const getFavoriteProductSlugsUseCase = new GetFavoriteProductSlugsUseCase(
	favoritesRepository,
	catalogProductsRepository,
)
const replaceFavoriteProductSlugsUseCase = new ReplaceFavoriteProductSlugsUseCase(
	favoritesRepository,
	catalogProductsRepository,
)
const addFavoriteProductUseCase = new AddFavoriteProductUseCase(
	favoritesRepository,
	catalogProductsRepository,
)
const removeFavoriteProductUseCase = new RemoveFavoriteProductUseCase(
	favoritesRepository,
	catalogProductsRepository,
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

async function createStore(slug: string) {
	return prisma.store.create({ data: { name: `Store ${slug}`, slug } })
}

async function createStoreCustomer(storeId: string, suffix: string) {
	return prisma.storeCustomer.create({
		data: {
			storeId,
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
		data: { storeId, name: `Produto ${slug}`, slug, status },
	})
}

describe('Favorites use cases', () => {
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

	describe('GetFavoriteProductSlugsUseCase', () => {
		test('returns only visible favorite slugs, excluding hidden ones', async () => {
			const store = await createStore('quintal-get-favorites')
			const storeCustomer = await createStoreCustomer(store.id, 'get-a')
			const visibleA = await createProduct(store.id, 'produto-visivel-a', 'ACTIVE')
			const visibleB = await createProduct(store.id, 'produto-visivel-b', 'ACTIVE')
			const hidden = await createProduct(store.id, 'produto-escondido', 'ARCHIVED')

			await prisma.customerFavorite.createMany({
				data: [
					{ storeCustomerId: storeCustomer.id, productId: visibleA.id },
					{ storeCustomerId: storeCustomer.id, productId: visibleB.id },
					{ storeCustomerId: storeCustomer.id, productId: hidden.id },
				],
			})

			const slugs = await getFavoriteProductSlugsUseCase.execute(store.id, storeCustomer.id)

			expect(slugs.sort()).toEqual(['produto-visivel-a', 'produto-visivel-b'].sort())
		})
	})

	describe('ReplaceFavoriteProductSlugsUseCase', () => {
		test('persists only valid/ACTIVE slugs, silently dropping unknown or inactive ones', async () => {
			const store = await createStore('quintal-replace-favorites')
			const storeCustomer = await createStoreCustomer(store.id, 'replace-a')
			const validProduct = await createProduct(store.id, 'produto-valido', 'ACTIVE')
			const inactiveProduct = await createProduct(store.id, 'produto-inativo', 'INACTIVE')

			await expect(
				replaceFavoriteProductSlugsUseCase.execute(store.id, storeCustomer.id, [
					validProduct.slug,
					'slug-que-nao-existe',
					inactiveProduct.slug,
				]),
			).resolves.not.toThrow()

			const persisted = await prisma.customerFavorite.findMany({
				where: { storeCustomerId: storeCustomer.id },
			})
			expect(persisted.map((row) => row.productId)).toEqual([validProduct.id])
		})

		test('a previously-hidden favorite survives a replace call even when absent from the incoming list', async () => {
			const store = await createStore('quintal-replace-hidden')
			const storeCustomer = await createStoreCustomer(store.id, 'replace-b')
			const hiddenProduct = await createProduct(store.id, 'produto-hidden-survive', 'ARCHIVED')
			const incomingProduct = await createProduct(store.id, 'produto-incoming', 'ACTIVE')

			await prisma.customerFavorite.create({
				data: { storeCustomerId: storeCustomer.id, productId: hiddenProduct.id },
			})

			await replaceFavoriteProductSlugsUseCase.execute(store.id, storeCustomer.id, [
				incomingProduct.slug,
			])

			const persisted = await prisma.customerFavorite.findMany({
				where: { storeCustomerId: storeCustomer.id },
				select: { productId: true },
			})
			expect(persisted.map((row) => row.productId).sort()).toEqual(
				[hiddenProduct.id, incomingProduct.id].sort(),
			)
		})

		test('a slug belonging to a product in a different store is treated as not found', async () => {
			const storeA = await createStore('quintal-replace-tenant-a')
			const storeB = await createStore('quintal-replace-tenant-b')
			const storeCustomerA = await createStoreCustomer(storeA.id, 'replace-tenant-a')
			const productInStoreB = await createProduct(storeB.id, 'produto-outra-loja', 'ACTIVE')

			await replaceFavoriteProductSlugsUseCase.execute(storeA.id, storeCustomerA.id, [
				productInStoreB.slug,
			])

			const persisted = await prisma.customerFavorite.findMany({
				where: { storeCustomerId: storeCustomerA.id },
			})
			expect(persisted).toHaveLength(0)
		})
	})

	describe('AddFavoriteProductUseCase', () => {
		test('adding a valid/ACTIVE product slug succeeds and is idempotent', async () => {
			const store = await createStore('quintal-add-favorite')
			const storeCustomer = await createStoreCustomer(store.id, 'add-a')
			const product = await createProduct(store.id, 'produto-add', 'ACTIVE')

			await addFavoriteProductUseCase.execute(store.id, storeCustomer.id, product.slug)
			await expect(
				addFavoriteProductUseCase.execute(store.id, storeCustomer.id, product.slug),
			).resolves.not.toThrow()

			const persisted = await prisma.customerFavorite.findMany({
				where: { storeCustomerId: storeCustomer.id, productId: product.id },
			})
			expect(persisted).toHaveLength(1)
		})

		test('adding an ACTIVE product that is fully out of stock succeeds, and GET still returns its slug (favorites are status-gated, not stock-gated — ADR 0006 regression guard)', async () => {
			const store = await createStore('quintal-add-sold-out')
			const storeCustomer = await createStoreCustomer(store.id, 'add-sold-out')
			const product = await createProduct(store.id, 'produto-esgotado', 'ACTIVE')
			await prisma.productVariant.create({
				data: {
					storeId: store.id,
					productId: product.id,
					name: 'Unico',
					sku: 'FAV-ESG-1',
					status: 'ACTIVE',
					priceCents: 9990,
					inventoryItem: { create: { storeId: store.id, availableQuantity: 0 } },
				},
			})

			await expect(
				addFavoriteProductUseCase.execute(store.id, storeCustomer.id, product.slug),
			).resolves.not.toThrow()

			const slugs = await getFavoriteProductSlugsUseCase.execute(store.id, storeCustomer.id)
			expect(slugs).toEqual(['produto-esgotado'])
		})

		test('adding an unknown slug rejects with FavoriteProductNotAvailableError', async () => {
			const store = await createStore('quintal-add-unknown')
			const storeCustomer = await createStoreCustomer(store.id, 'add-b')

			await expect(
				addFavoriteProductUseCase.execute(store.id, storeCustomer.id, 'slug-inexistente'),
			).rejects.toBeInstanceOf(FavoriteProductNotAvailableError)
		})

		test('adding a non-ACTIVE product slug rejects with FavoriteProductNotAvailableError', async () => {
			const store = await createStore('quintal-add-inactive')
			const storeCustomer = await createStoreCustomer(store.id, 'add-c')
			const inactiveProduct = await createProduct(store.id, 'produto-add-inativo', 'INACTIVE')

			await expect(
				addFavoriteProductUseCase.execute(store.id, storeCustomer.id, inactiveProduct.slug),
			).rejects.toBeInstanceOf(FavoriteProductNotAvailableError)

			const persisted = await prisma.customerFavorite.findMany({
				where: { storeCustomerId: storeCustomer.id, productId: inactiveProduct.id },
			})
			expect(persisted).toHaveLength(0)
		})
	})

	describe('RemoveFavoriteProductUseCase', () => {
		test('removing a slug that was never favorited succeeds without error', async () => {
			const store = await createStore('quintal-remove-favorite')
			const storeCustomer = await createStoreCustomer(store.id, 'remove-a')
			const product = await createProduct(store.id, 'produto-remove', 'ACTIVE')

			await expect(
				removeFavoriteProductUseCase.execute(store.id, storeCustomer.id, product.slug),
			).resolves.not.toThrow()
		})

		test('removing an unknown slug is a no-op without error', async () => {
			const store = await createStore('quintal-remove-unknown')
			const storeCustomer = await createStoreCustomer(store.id, 'remove-b')

			await expect(
				removeFavoriteProductUseCase.execute(store.id, storeCustomer.id, 'slug-inexistente'),
			).resolves.not.toThrow()
		})

		test('removes an existing favorite by slug', async () => {
			const store = await createStore('quintal-remove-existing')
			const storeCustomer = await createStoreCustomer(store.id, 'remove-c')
			const product = await createProduct(store.id, 'produto-remove-existente', 'ACTIVE')
			await prisma.customerFavorite.create({
				data: { storeCustomerId: storeCustomer.id, productId: product.id },
			})

			await removeFavoriteProductUseCase.execute(store.id, storeCustomer.id, product.slug)

			const persisted = await prisma.customerFavorite.findMany({
				where: { storeCustomerId: storeCustomer.id, productId: product.id },
			})
			expect(persisted).toHaveLength(0)
		})
	})
})
