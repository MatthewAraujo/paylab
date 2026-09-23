import { ManageInventoryUseCase } from '@/domain/quintalpet/application/use-cases/manage-inventory'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const inventoryItemsRepository = new PrismaInventoryItemsRepository(prisma)
const useCase = new ManageInventoryUseCase(prisma, inventoryItemsRepository)

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

describe('ManageInventoryUseCase.listStockItems', () => {
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

	test('lists a freshly created variant with zero stock even before any InventoryItem row exists', async () => {
		const store = await prisma.store.create({
			data: { name: 'Inventory List Store', slug: 'inventory-list-store' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Marca', slug: 'marca-list' },
		})
		const category = await prisma.category.create({
			data: { storeId: store.id, name: 'Categoria', slug: 'categoria-list' },
		})
		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Produto Novo',
				slug: 'produto-novo',
				brandId: brand.id,
				primaryCategoryId: category.id,
			},
		})
		const variant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: '15kg',
				sku: 'SKU-LIST-001',
				priceCents: 25990,
			},
		})

		const items = await useCase.listStockItems(store.id)

		expect(items).toHaveLength(1)
		expect(items[0]).toMatchObject({
			id: null,
			variantId: variant.id,
			availableQuantity: 0,
			createdAt: null,
			updatedAt: null,
			variant: { id: variant.id, sku: 'SKU-LIST-001', name: '15kg' },
		})
	})

	test('reflects the real InventoryItem once stock has been received', async () => {
		const store = await prisma.store.create({
			data: { name: 'Inventory List Store 2', slug: 'inventory-list-store-2' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Marca', slug: 'marca-list-2' },
		})
		const category = await prisma.category.create({
			data: { storeId: store.id, name: 'Categoria', slug: 'categoria-list-2' },
		})
		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Produto Recebido',
				slug: 'produto-recebido',
				brandId: brand.id,
				primaryCategoryId: category.id,
			},
		})
		const variant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: '3kg',
				sku: 'SKU-LIST-002',
				priceCents: 9990,
			},
		})

		await useCase.receiveStock(store.id, variant.id, 12, 'initial inbound')

		const items = await useCase.listStockItems(store.id)

		expect(items).toHaveLength(1)
		expect(items[0].id).not.toBeNull()
		expect(items[0].availableQuantity).toBe(12)
		expect(items[0].createdAt).not.toBeNull()
	})
})
