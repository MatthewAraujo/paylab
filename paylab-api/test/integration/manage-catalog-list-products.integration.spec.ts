import { ManageCatalogUseCase } from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogBrandsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-brands-repository'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaCatalogProductsRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-products-repository'
import { PrismaAttachmentsRepository } from '@/infra/database/prisma/repositories/prisma-attachments-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const useCase = new ManageCatalogUseCase(
	prisma,
	new PrismaAttachmentsRepository(prisma),
	new PrismaCatalogBrandsRepository(prisma),
	new PrismaCatalogCategoriesRepository(prisma),
	new PrismaCatalogProductsRepository(prisma),
)

async function resetDatabase() {
	await prisma.auditLog.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
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

describe('ManageCatalogUseCase.listProducts', () => {
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

	test('the operator catalog list still returns a fully out-of-stock ACTIVE product — the storefront stock-visibility rule is exempt for admin (ADR 0006 regression guard)', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Admin List', slug: 'quintal-admin-list' },
		})

		const soldOut = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Racao Esgotada',
				slug: 'racao-esgotada',
				status: 'ACTIVE',
				variants: {
					create: [
						{
							storeId: store.id,
							name: '10kg',
							sku: 'ADMIN-ESG-10',
							status: 'ACTIVE',
							priceCents: 15990,
							inventoryItem: { create: { storeId: store.id, availableQuantity: 0 } },
						},
					],
				},
			},
		})

		const products = await useCase.listProducts(store.id)

		expect(products.map((product) => product.id)).toContain(soldOut.id)
	})
})
