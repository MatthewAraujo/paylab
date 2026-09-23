import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
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

describe('ManageCatalogUseCase.addVariant SKU generation', () => {
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

	test('generates a standardized SKU when none is supplied, and distinct sequences per variant', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sku', slug: 'quintal-sku' },
		})
		const category = await useCase.createCategory({ storeId: store.id, name: 'Cachorro' })
		const product = await useCase.createProduct({
			storeId: store.id,
			name: 'Racao Premium Caes Adultos',
			slug: 'racao-premium-caes-adultos',
			primaryCategoryId: category.id.toString(),
		})

		const firstVariant = await useCase.addVariant(store.id, product.id.toString(), {
			name: '10kg',
			priceCents: 15990,
			attributes: { weight: '10kg' },
		})

		const secondVariant = await useCase.addVariant(store.id, product.id.toString(), {
			name: '15kg',
			priceCents: 19990,
			attributes: { weight: '15kg' },
		})

		expect(firstVariant.sku.value).toBe('CACH-RACAOP-01')
		expect(secondVariant.sku.value).toBe('CACH-RACAOP-02')
	})

	test('still accepts an explicit sku override', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sku Override', slug: 'quintal-sku-override' },
		})
		const product = await useCase.createProduct({
			storeId: store.id,
			name: 'Tapete Higienico',
			slug: 'tapete-higienico',
		})

		const variant = await useCase.addVariant(store.id, product.id.toString(), {
			name: 'Unico',
			sku: 'CUSTOM-SKU-001',
			priceCents: 4990,
			attributes: {},
		})

		expect(variant.sku.value).toBe('CUSTOM-SKU-001')
	})

	test('resolves a collision between a manual SKU and a later generated one', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Sku Collide', slug: 'quintal-sku-collide' },
		})
		const category = await useCase.createCategory({ storeId: store.id, name: 'Cachorro' })
		const product = await useCase.createProduct({
			storeId: store.id,
			name: 'Racao Premium Caes Adultos',
			slug: 'racao-premium-caes-adultos',
			primaryCategoryId: category.id.toString(),
		})

		// This is the product's first variant (by count), but its manual SKU happens
		// to collide with what sequence *2* would generate — i.e. what the next
		// auto-generated variant on this product would naturally produce.
		await useCase.addVariant(store.id, product.id.toString(), {
			name: 'Manual',
			sku: 'CACH-RACAOP-02',
			priceCents: 9990,
			attributes: {},
		})

		const generated = await useCase.addVariant(store.id, product.id.toString(), {
			name: 'Auto',
			priceCents: 12990,
			attributes: {},
		})

		// Sequence 2 (1 existing variant + 1) is taken by the manual SKU, so
		// generation must advance to sequence 3 instead of crashing on the
		// unique-constraint violation sequence 2 would hit.
		expect(generated.sku.value).toBe('CACH-RACAOP-03')
	})
})
