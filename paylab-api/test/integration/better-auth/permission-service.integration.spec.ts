import { PermissionService } from '@/infra/better-auth/permission.service'
import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const permissionService = new PermissionService(prisma)

async function resetDatabase() {
	await prisma.storeMember.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.store.deleteMany()
}

describe('PermissionService reflects real StoreMember and CustomerProfile rows', () => {
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

	test('isStoreMember returns true only for a userId with a StoreMember row', async () => {
		const store = await prisma.store.create({
			data: { name: 'Quintal Norte', slug: 'quintal-norte-permission' },
		})
		await prisma.storeMember.create({
			data: { userId: 'user-with-membership', storeId: store.id },
		})

		await expect(permissionService.isStoreMember('user-with-membership')).resolves.toBe(true)
		await expect(permissionService.isStoreMember('user-without-membership')).resolves.toBe(false)
	})

	test('isCustomer returns true only for a userId with a CustomerProfile row', async () => {
		await prisma.customerProfile.create({ data: { userId: 'user-with-profile' } })

		await expect(permissionService.isCustomer('user-with-profile')).resolves.toBe(true)
		await expect(permissionService.isCustomer('user-without-profile')).resolves.toBe(false)
	})

	test('getAccessibleStores returns every store the user is a member of, and only those', async () => {
		const [storeA, storeB, storeC] = await Promise.all([
			prisma.store.create({ data: { name: 'Store A', slug: 'store-a-permission' } }),
			prisma.store.create({ data: { name: 'Store B', slug: 'store-b-permission' } }),
			prisma.store.create({ data: { name: 'Store C', slug: 'store-c-permission' } }),
		])
		await Promise.all([
			prisma.storeMember.create({ data: { userId: 'multi-store-user', storeId: storeA.id } }),
			prisma.storeMember.create({ data: { userId: 'multi-store-user', storeId: storeB.id } }),
		])

		const accessible = await permissionService.getAccessibleStores('multi-store-user')

		expect(accessible.sort()).toEqual([storeA.id, storeB.id].sort())
		expect(accessible).not.toContain(storeC.id)
	})

	test('canAccessStore reflects membership for a specific store only', async () => {
		const [storeA, storeB] = await Promise.all([
			prisma.store.create({ data: { name: 'Store D', slug: 'store-d-permission' } }),
			prisma.store.create({ data: { name: 'Store E', slug: 'store-e-permission' } }),
		])
		await prisma.storeMember.create({ data: { userId: 'single-store-user', storeId: storeA.id } })

		await expect(permissionService.canAccessStore('single-store-user', storeA.id)).resolves.toBe(
			true,
		)
		await expect(permissionService.canAccessStore('single-store-user', storeB.id)).resolves.toBe(
			false,
		)
	})
})
