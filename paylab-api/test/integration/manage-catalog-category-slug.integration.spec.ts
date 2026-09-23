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

describe('ManageCatalogUseCase category slug generation', () => {
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

	test('createCategory ignores any client-supplied slug and derives it from name/parent', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Slug', slug: 'quintal-slug' },
		})

		const dog = await useCase.createCategory({
			storeId: store.id,
			name: 'Cachorro',
			// A client-supplied slug must never be honored, even if the signature still
			// accepted one — this exercises the deliberately garbage value.
			...({ slug: 'whatever-the-client-sent' } as Record<string, unknown>),
		} as Parameters<typeof useCase.createCategory>[0])

		expect(dog.slug.value).toBe('cachorro')

		const dogFood = await useCase.createCategory({
			storeId: store.id,
			name: 'Ração',
			parentCategoryId: dog.id.toString(),
		})

		expect(dogFood.slug.value).toBe('cachorro-racao')

		const cat = await useCase.createCategory({
			storeId: store.id,
			name: 'Gato',
		})

		const catFood = await useCase.createCategory({
			storeId: store.id,
			name: 'Ração',
			parentCategoryId: cat.id.toString(),
		})

		// Same child name under a different parent must not collide.
		expect(catFood.slug.value).toBe('gato-racao')
		expect(catFood.slug.value).not.toBe(dogFood.slug.value)
	})

	test('createCategory appends a numeric suffix when the generated slug collides', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Collide', slug: 'quintal-collide' },
		})

		const first = await useCase.createCategory({ storeId: store.id, name: 'Ração' })
		const second = await useCase.createCategory({ storeId: store.id, name: 'Ração' })
		const third = await useCase.createCategory({ storeId: store.id, name: 'Ração' })

		expect(first.slug.value).toBe('racao')
		expect(second.slug.value).toBe('racao-2')
		expect(third.slug.value).toBe('racao-3')
	})

	test('updateCategory never changes the slug, even when name or parent changes', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Immutable', slug: 'quintal-immutable' },
		})

		const originalParent = await useCase.createCategory({ storeId: store.id, name: 'Cachorro' })
		const newParent = await useCase.createCategory({ storeId: store.id, name: 'Gato' })
		const child = await useCase.createCategory({
			storeId: store.id,
			name: 'Ração',
			parentCategoryId: originalParent.id.toString(),
		})

		expect(child.slug.value).toBe('cachorro-racao')

		const renamed = await useCase.updateCategory(store.id, child.id.toString(), {
			name: 'Ração Premium',
			parentCategoryId: newParent.id.toString(),
		})

		expect(renamed.slug.value).toBe('cachorro-racao')
		expect(renamed.name).toBe('Ração Premium')
		expect(renamed.parentCategoryId?.toString()).toBe(newParent.id.toString())
	})
})
