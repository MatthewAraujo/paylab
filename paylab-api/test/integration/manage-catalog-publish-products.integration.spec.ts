import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { QueryStorefrontUseCase } from '@/domain/quintalpet/application/use-cases/query-storefront'
import { ProductStatus } from '@/domain/quintalpet/enterprise/types/product-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogBrandsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-brands-repository'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaCatalogProductsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-products-repository'
import { PrismaAttachmentsRepository } from '@/infra/database/prisma/repositories/prisma-attachments-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const attachmentsRepository = new PrismaAttachmentsRepository(prisma)
const brandsRepository = new PrismaCatalogBrandsRepository(prisma)
const categoriesRepository = new PrismaCatalogCategoriesRepository(prisma)
const productsRepository = new PrismaCatalogProductsRepository(prisma)
const storefrontUseCase = new QueryStorefrontUseCase(prisma)

const useCase = new ManageCatalogUseCase(
	prisma,
	attachmentsRepository,
	brandsRepository,
	categoriesRepository,
	productsRepository,
)

async function resetDatabase() {
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.attachment.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await prisma.store.deleteMany()
}

describe('ManageCatalogUseCase.publishProducts', () => {
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

	async function seedStore(name: string, slug: string) {
		return prisma.store.create({ data: { name, slug } })
	}

	async function createDraftProduct(storeId: string, slug: string) {
		return useCase.createProduct({ storeId, name: slug, slug })
	}

	test('publishes every DRAFT product in the list and persists them as ACTIVE', async () => {
		const store = await seedStore('Quintal Publish', 'quintal-publish')
		const a = await createDraftProduct(store.id, 'produto-a')
		const b = await createDraftProduct(store.id, 'produto-b')
		const c = await createDraftProduct(store.id, 'produto-c')

		const ids = [a.id.toString(), b.id.toString(), c.id.toString()]

		const result = await useCase.publishProducts(store.id, ids)

		expect(result.skipped).toEqual([])
		expect(new Set(result.published.map((entry) => entry.id))).toEqual(new Set(ids))
		expect(result.published.every((entry) => entry.status === ProductStatus.ACTIVE)).toBe(true)

		for (const id of ids) {
			const reloaded = await productsRepository.findById(id, store.id)
			expect(reloaded?.status).toBe(ProductStatus.ACTIVE)
			expect(reloaded?.publishedAt).not.toBeNull()
		}
	})

	test('skips non-DRAFT and unknown ids without aborting the batch', async () => {
		const store = await seedStore('Quintal Mixed', 'quintal-mixed')

		const draftOne = await createDraftProduct(store.id, 'draft-1')
		const draftTwo = await createDraftProduct(store.id, 'draft-2')

		const activeProduct = await createDraftProduct(store.id, 'active-1')
		await useCase.publishProduct(store.id, activeProduct.id.toString())

		const inactiveProduct = await createDraftProduct(store.id, 'inactive-1')
		await useCase.publishProduct(store.id, inactiveProduct.id.toString())
		await useCase.deactivateProduct(store.id, inactiveProduct.id.toString())

		const archivedProduct = await createDraftProduct(store.id, 'archived-1')
		await useCase.archiveProduct(store.id, archivedProduct.id.toString())

		const unknownId = '00000000-0000-4000-8000-000000000000'

		const result = await useCase.publishProducts(store.id, [
			draftOne.id.toString(),
			draftTwo.id.toString(),
			activeProduct.id.toString(),
			inactiveProduct.id.toString(),
			archivedProduct.id.toString(),
			unknownId,
		])

		expect(new Set(result.published.map((entry) => entry.id))).toEqual(
			new Set([draftOne.id.toString(), draftTwo.id.toString()]),
		)

		const skippedById = new Map(result.skipped.map((entry) => [entry.id, entry]))
		expect(skippedById.get(activeProduct.id.toString())).toMatchObject({
			reason: 'not_draft',
			currentStatus: ProductStatus.ACTIVE,
			name: 'active-1',
		})
		expect(skippedById.get(inactiveProduct.id.toString())).toMatchObject({
			reason: 'not_draft',
			currentStatus: ProductStatus.INACTIVE,
		})
		expect(skippedById.get(archivedProduct.id.toString())).toMatchObject({
			reason: 'not_draft',
			currentStatus: ProductStatus.ARCHIVED,
		})
		expect(skippedById.get(unknownId)).toMatchObject({ reason: 'not_found', name: null })
		expect(skippedById.get(unknownId)).not.toHaveProperty('currentStatus')

		expect((await productsRepository.findById(activeProduct.id.toString(), store.id))?.status).toBe(
			ProductStatus.ACTIVE,
		)
		expect(
			(await productsRepository.findById(inactiveProduct.id.toString(), store.id))?.status,
		).toBe(ProductStatus.INACTIVE)
		expect(
			(await productsRepository.findById(archivedProduct.id.toString(), store.id))?.status,
		).toBe(ProductStatus.ARCHIVED)
	})

	test("never touches another store's product and reports it as not_found", async () => {
		const storeA = await seedStore('Store A', 'store-a')
		const storeB = await seedStore('Store B', 'store-b')

		const storeBDraft = await createDraftProduct(storeB.id, 'store-b-draft')

		const result = await useCase.publishProducts(storeA.id, [storeBDraft.id.toString()])

		expect(result.published).toEqual([])
		expect(result.skipped).toEqual([
			{ id: storeBDraft.id.toString(), name: null, reason: 'not_found' },
		])

		const reloaded = await productsRepository.findById(storeBDraft.id.toString(), storeB.id)
		expect(reloaded?.status).toBe(ProductStatus.DRAFT)
	})

	test('treats a duplicated id once', async () => {
		const store = await seedStore('Quintal Dupe', 'quintal-dupe')
		const draft = await createDraftProduct(store.id, 'dupe-draft')
		const id = draft.id.toString()

		const result = await useCase.publishProducts(store.id, [id, id])

		expect(result.published).toEqual([{ id, status: ProductStatus.ACTIVE }])
		expect(result.skipped).toEqual([])
	})

	test('published and skipped are disjoint and cover every distinct input id', async () => {
		const store = await seedStore('Quintal Cover', 'quintal-cover')
		const draft = await createDraftProduct(store.id, 'cover-draft')
		const active = await createDraftProduct(store.id, 'cover-active')
		await useCase.publishProduct(store.id, active.id.toString())
		const unknownId = '11111111-1111-4111-8111-111111111111'

		const input = [draft.id.toString(), active.id.toString(), unknownId, draft.id.toString()]

		const result = await useCase.publishProducts(store.id, input)

		const publishedIds = result.published.map((entry) => entry.id)
		const skippedIds = result.skipped.map((entry) => entry.id)
		const allIds = [...publishedIds, ...skippedIds]

		expect(new Set(allIds)).toEqual(new Set(input))
		expect(allIds.length).toBe(new Set(input).size)
		expect(publishedIds.filter((id) => skippedIds.includes(id))).toEqual([])
	})

	test('publishing a mixed-stock draft keeps the product visible and only the empty variant unavailable', async () => {
		const store = await seedStore('Quintal Mixed Stock', 'quintal-mixed-stock')

		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Racao Estoque Misto',
				slug: 'racao-estoque-misto',
				status: 'DRAFT',
				variants: {
					create: [
						{
							storeId: store.id,
							name: '3kg',
							sku: 'MIX-STOCK-3',
							status: 'ACTIVE',
							priceCents: 7990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 0 },
							},
						},
						{
							storeId: store.id,
							name: '12kg',
							sku: 'MIX-STOCK-12',
							status: 'ACTIVE',
							priceCents: 16990,
							inventoryItem: {
								create: { storeId: store.id, availableQuantity: 6 },
							},
						},
					],
				},
			},
		})

		const result = await useCase.publishProducts(store.id, [product.id])

		expect(result.published).toEqual([{ id: product.id, status: ProductStatus.ACTIVE }])
		expect(result.skipped).toEqual([])

		const listing = await storefrontUseCase.listProducts({
			storeSlug: store.slug,
			page: 1,
			limit: 20,
		})
		expect(listing.items.map((item) => item.slug)).toEqual(['racao-estoque-misto'])
		expect(listing.items[0]?.inStock).toBe(true)

		const page = await storefrontUseCase.getProductBySlug('racao-estoque-misto', store.slug)
		expect(page.inStock).toBe(true)
		expect(
			page.variants.map((variant) => ({
				name: variant.name,
				availableQuantity: variant.availableQuantity,
				inStock: variant.inStock,
			})),
		).toEqual([
			{ name: '3kg', availableQuantity: 0, inStock: false },
			{ name: '12kg', availableQuantity: 6, inStock: true },
		])
	})
})
