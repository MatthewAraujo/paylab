import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
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

const useCase = new ManageCatalogUseCase(
	prisma,
	attachmentsRepository,
	brandsRepository,
	categoriesRepository,
	productsRepository,
)

async function resetDatabase() {
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

describe('ManageCatalogUseCase.updateProduct', () => {
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

	async function seedStoreWithProduct() {
		const store = await prisma.store.create({
			data: { name: 'Quintal Update', slug: 'quintal-update' },
		})

		const originalCategory = await prisma.category.create({
			data: { storeId: store.id, name: 'Caes', slug: 'caes' },
		})

		const newCategory = await prisma.category.create({
			data: { storeId: store.id, name: 'Gatos', slug: 'gatos' },
		})

		const product = await useCase.createProduct({
			storeId: store.id,
			name: 'Racao Original',
			slug: 'racao-original',
			description: 'Descricao original',
			primaryCategoryId: originalCategory.id,
		})

		return { store, originalCategory, newCategory, product }
	}

	test('persists a category reassignment sent as only primaryCategoryId, with no categoryIds', async () => {
		const { store, newCategory, product } = await seedStoreWithProduct()

		// The admin client sends only `primaryCategoryId` (singular) on update, never
		// `categoryIds`. This must still persist the reassignment.
		await useCase.updateProduct(store.id, product.id.toString(), {
			primaryCategoryId: newCategory.id,
		})

		const reloaded = await productsRepository.findById(product.id.toString(), store.id)

		expect(reloaded?.primaryCategoryId?.toString()).toBe(newCategory.id)
		// A single-category reassignment (no explicit categoryIds) replaces the whole
		// set rather than leaving the product also still filed under the old category.
		expect(reloaded?.categoryIds.map((id) => id.toString())).toEqual([newCategory.id])
	})

	test('persists a status transition sent via the update payload', async () => {
		const { store, product } = await seedStoreWithProduct()

		await useCase.publishProduct(store.id, product.id.toString())

		await useCase.updateProduct(store.id, product.id.toString(), {
			status: ProductStatus.INACTIVE,
		})

		const reloaded = await productsRepository.findById(product.id.toString(), store.id)

		expect(reloaded?.status).toBe(ProductStatus.INACTIVE)
	})

	test('leaves category and status untouched when the payload only changes name/description', async () => {
		const { store, originalCategory, product } = await seedStoreWithProduct()

		await useCase.updateProduct(store.id, product.id.toString(), {
			name: 'Racao Original 15kg',
			description: 'Nova descricao',
		})

		const reloaded = await productsRepository.findById(product.id.toString(), store.id)

		expect(reloaded?.name).toBe('Racao Original 15kg')
		expect(reloaded?.description).toBe('Nova descricao')
		expect(reloaded?.primaryCategoryId?.toString()).toBe(originalCategory.id)
		expect(reloaded?.status).toBe(ProductStatus.DRAFT)
	})
})
