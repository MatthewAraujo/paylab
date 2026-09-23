import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const inventoryItemsRepository = new PrismaInventoryItemsRepository(prisma)

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

describe('Prisma inventory repository', () => {
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

	test('persists movements and stock snapshots for one variant', async () => {
		const store = await prisma.store.create({
			data: { name: 'Inventory Store', slug: 'inventory-store' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Marca', slug: 'marca' },
		})
		const category = await prisma.category.create({
			data: { storeId: store.id, name: 'Categoria', slug: 'categoria' },
		})
		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Produto',
				slug: 'produto',
				brandId: brand.id,
				primaryCategoryId: category.id,
			},
		})
		const variant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: '15kg',
				sku: 'SKU-INV-001',
				priceCents: 25990,
			},
		})

		const item = InventoryItem.create(
			{
				storeId: new UniqueEntityID(store.id),
				variantId: new UniqueEntityID(variant.id),
			},
			new UniqueEntityID('inventory-item-1'),
		)

		await inventoryItemsRepository.save(item, item.receive(10, 'initial inbound'))
		await inventoryItemsRepository.save(item, item.remove(3, 'manual outbound'))
		await inventoryItemsRepository.save(item, item.adjust(-1, 'shrinkage'))
		await inventoryItemsRepository.save(item, item.returnStock(2, 'return'))

		const reloaded = await inventoryItemsRepository.findByVariantId(variant.id, store.id)

		expect(reloaded?.availableQuantity).toBe(8)
		expect(reloaded?.movements.map((movement) => movement.quantityDelta)).toEqual([10, -3, -1, 2])
		expect(reloaded?.movements.map((movement) => movement.balanceAfter)).toEqual([10, 7, 6, 8])
	})

	test('save() with an externally-supplied tx that is rolled back leaves no trace of the movement', async () => {
		const store = await prisma.store.create({
			data: { name: 'Rollback Store', slug: 'rollback-store' },
		})
		const brand = await prisma.brand.create({
			data: { storeId: store.id, name: 'Marca', slug: 'marca-rollback' },
		})
		const category = await prisma.category.create({
			data: { storeId: store.id, name: 'Categoria', slug: 'categoria-rollback' },
		})
		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Produto',
				slug: 'produto-rollback',
				brandId: brand.id,
				primaryCategoryId: category.id,
			},
		})
		const variant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: '15kg',
				sku: 'SKU-ROLLBACK-001',
				priceCents: 25990,
			},
		})

		const item = InventoryItem.create(
			{
				storeId: new UniqueEntityID(store.id),
				variantId: new UniqueEntityID(variant.id),
			},
			new UniqueEntityID('inventory-item-rollback'),
		)
		const movement = item.receive(10, 'initial inbound')

		await expect(
			prisma.$transaction(async (tx) => {
				await inventoryItemsRepository.save(item, movement, tx)
				throw new Error('force rollback')
			}),
		).rejects.toThrow('force rollback')

		const reloadedItem = await prisma.inventoryItem.findUnique({
			where: { id: item.id.toString() },
		})
		const reloadedMovements = await prisma.inventoryMovement.findMany({
			where: { inventoryItemId: item.id.toString() },
		})

		expect(reloadedItem).toBeNull()
		expect(reloadedMovements).toHaveLength(0)
	})
})
