import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { HomeMerchandisingConfiguration } from '@/domain/quintalpet/enterprise/entities/home-merchandising-configuration'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaHomeMerchandisingConfigurationsRepository } from '@/infra/database/prisma/repositories/merchandising/prisma-home-merchandising-configurations-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const repository = new PrismaHomeMerchandisingConfigurationsRepository(prisma)

async function resetDatabase() {
	await prisma.merchandisingFeaturedProduct.deleteMany()
	await prisma.merchandisingFeaturedCategory.deleteMany()
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

describe('Prisma home merchandising configurations repository', () => {
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

	test('persists and replaces the flat home merchandising configuration', async () => {
		const store = await prisma.store.create({
			data: { name: 'Merch Store', slug: 'merch-store' },
		})
		const [dog1, dog2, cat1, agro1] = await Promise.all([
			prisma.category.create({
				data: { storeId: store.id, name: 'Dogs Food', slug: 'dogs-food' },
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Dogs Toys', slug: 'dogs-toys' },
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Cats', slug: 'cats' },
			}),
			prisma.category.create({
				data: { storeId: store.id, name: 'Agro', slug: 'agro' },
			}),
		])
		const [product1, product2] = await Promise.all([
			prisma.product.create({
				data: {
					storeId: store.id,
					name: 'Racao Premium',
					slug: 'racao-premium',
					status: 'ACTIVE',
				},
			}),
			prisma.product.create({
				data: {
					storeId: store.id,
					name: 'Areia',
					slug: 'areia',
					status: 'ACTIVE',
				},
			}),
		])

		const configuration = HomeMerchandisingConfiguration.create({
			storeId: new UniqueEntityID(store.id),
		})

		configuration.replaceFeaturedCategories([
			{ entityId: new UniqueEntityID(dog1.id), storeId: new UniqueEntityID(store.id) },
			{ entityId: new UniqueEntityID(dog2.id), storeId: new UniqueEntityID(store.id) },
			{ entityId: new UniqueEntityID(cat1.id), storeId: new UniqueEntityID(store.id) },
			{ entityId: new UniqueEntityID(agro1.id), storeId: new UniqueEntityID(store.id) },
		])
		configuration.replaceFeaturedProducts([
			{ entityId: new UniqueEntityID(product1.id), storeId: new UniqueEntityID(store.id) },
		])

		await repository.save(configuration)

		configuration.replaceFeaturedCategories([
			{ entityId: new UniqueEntityID(dog2.id), storeId: new UniqueEntityID(store.id) },
			{ entityId: new UniqueEntityID(agro1.id), storeId: new UniqueEntityID(store.id) },
			{ entityId: new UniqueEntityID(cat1.id), storeId: new UniqueEntityID(store.id) },
		])
		configuration.replaceFeaturedProducts([
			{ entityId: new UniqueEntityID(product2.id), storeId: new UniqueEntityID(store.id) },
			{ entityId: new UniqueEntityID(product1.id), storeId: new UniqueEntityID(store.id) },
		])

		await repository.save(configuration)

		const reloaded = await repository.findByStoreId(store.id)

		expect(reloaded?.featuredCategoryIds.map((id) => id.toString())).toEqual([
			dog2.id,
			agro1.id,
			cat1.id,
		])
		expect(reloaded?.featuredProductIds.map((id) => id.toString())).toEqual([
			product2.id,
			product1.id,
		])
		expect(await prisma.merchandisingFeaturedCategory.count()).toBe(3)
		expect(await prisma.merchandisingFeaturedProduct.count()).toBe(2)
	})
})
