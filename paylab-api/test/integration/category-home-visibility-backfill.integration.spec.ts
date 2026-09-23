import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()

async function resetDatabase() {
	await prisma.merchandisingFeaturedCategory.deleteMany()
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

/**
 * This spec re-runs the exact backfill statements from
 * prisma/migrations/20260824030000_add_category_is_visible_on_home/migration.sql
 * against rows seeded as if the column had just been added with its `false`
 * default (pre-backfill) — proving the backfill puts `isVisibleOnHome` back to
 * the pre-migration "what showed on the home" state, which is the entire point
 * of shipping it in the same migration (see T3 / phase README Risk Plan).
 */
async function runCategoryVisibilityBackfill() {
	await prisma.$executeRaw`
		UPDATE "categories"
		SET "is_visible_on_home" = true
		WHERE "parent_category_id" IS NULL
		  AND "status" = 'ACTIVE'
	`
	await prisma.$executeRaw`
		UPDATE "categories"
		SET "is_visible_on_home" = true
		WHERE "id" IN (SELECT "category_id" FROM "merchandising_featured_categories")
	`
}

describe('Category isVisibleOnHome migration backfill', () => {
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

	test('backfill restores pre-migration home visibility: active roots true, inactive roots untouched, only featured children true', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Backfill', slug: 'quintal-backfill' },
		})

		// Seeded with the column's raw `false` default, as if the ADD COLUMN step had
		// just run and the backfill UPDATEs hadn't executed yet.
		const [activeRoot, inactiveRoot, archivedRoot] = await Promise.all([
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Caes',
					slug: 'caes',
					status: 'ACTIVE',
					isVisibleOnHome: false,
				},
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Inativa',
					slug: 'inativa',
					status: 'INACTIVE',
					isVisibleOnHome: false,
				},
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					name: 'Arquivada',
					slug: 'arquivada',
					status: 'ARCHIVED',
					isVisibleOnHome: false,
				},
			}),
		])

		const [featuredChild, unfeaturedChild] = await Promise.all([
			prisma.category.create({
				data: {
					storeId: store.id,
					parentCategoryId: activeRoot.id,
					name: 'Racao Featured',
					slug: 'racao-featured',
					status: 'ACTIVE',
					isVisibleOnHome: false,
				},
			}),
			prisma.category.create({
				data: {
					storeId: store.id,
					parentCategoryId: activeRoot.id,
					name: 'Racao Nao Featured',
					slug: 'racao-nao-featured',
					status: 'ACTIVE',
					isVisibleOnHome: false,
				},
			}),
		])

		await prisma.merchandisingFeaturedCategory.create({
			data: { storeId: store.id, categoryId: featuredChild.id, position: 0 },
		})

		await runCategoryVisibilityBackfill()

		const [reloadedActiveRoot, reloadedInactiveRoot, reloadedArchivedRoot] = await Promise.all([
			prisma.category.findUniqueOrThrow({ where: { id: activeRoot.id } }),
			prisma.category.findUniqueOrThrow({ where: { id: inactiveRoot.id } }),
			prisma.category.findUniqueOrThrow({ where: { id: archivedRoot.id } }),
		])
		const [reloadedFeaturedChild, reloadedUnfeaturedChild] = await Promise.all([
			prisma.category.findUniqueOrThrow({ where: { id: featuredChild.id } }),
			prisma.category.findUniqueOrThrow({ where: { id: unfeaturedChild.id } }),
		])

		expect(reloadedActiveRoot.isVisibleOnHome).toBe(true)
		expect(reloadedInactiveRoot.isVisibleOnHome).toBe(false)
		expect(reloadedArchivedRoot.isVisibleOnHome).toBe(false)
		expect(reloadedFeaturedChild.isVisibleOnHome).toBe(true)
		expect(reloadedUnfeaturedChild.isVisibleOnHome).toBe(false)
	})
})
