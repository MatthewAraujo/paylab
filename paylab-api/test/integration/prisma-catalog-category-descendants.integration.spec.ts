import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const repository = new PrismaCatalogCategoriesRepository(prisma)

async function resetDatabase() {
	await prisma.productCategory.deleteMany()
	await prisma.category.deleteMany()
	await prisma.store.deleteMany()
}

describe('PrismaCatalogCategoriesRepository.listDescendantIds', () => {
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

	test('returns the full store-scoped subtree, excluding the node itself', async () => {
		const store = await prisma.store.create({
			data: { name: 'Loja', slug: 'loja-descendants' },
		})
		const other = await prisma.store.create({
			data: { name: 'Outra', slug: 'loja-descendants-other' },
		})

		const dogs = await prisma.category.create({
			data: { storeId: store.id, name: 'Cachorros', slug: 'cachorros' },
		})
		const accessories = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Acessorios',
				slug: 'cachorros-acessorios',
				parentCategoryId: dogs.id,
			},
		})
		const leashes = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Coleiras',
				slug: 'cachorros-coleiras',
				parentCategoryId: accessories.id,
			},
		})
		// Sibling branch under the root — must NOT appear as a descendant of accessories.
		await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Racao',
				slug: 'cachorros-racao',
				parentCategoryId: dogs.id,
			},
		})
		// Same slug shape in another store — never leaks.
		await prisma.category.create({
			data: { storeId: other.id, name: 'Cachorros', slug: 'cachorros' },
		})

		const subtree = await repository.listDescendantIds(dogs.id, store.id)
		expect(new Set(subtree)).toEqual(new Set([accessories.id, leashes.id, expect.any(String)]))
		expect(subtree).toHaveLength(3)
		expect(subtree).not.toContain(dogs.id)

		expect(await repository.listDescendantIds(accessories.id, store.id)).toEqual([leashes.id])
		expect(await repository.listDescendantIds(leashes.id, store.id)).toEqual([])
	})
})
