import { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const prisma = new PrismaClient()

describe('Store Owner Onboarding Flow', () => {
	let testStoreId: string

	beforeAll(async () => {
		// Create a test store
		const store = await prisma.store.create({
			data: {
				name: 'Test Store',
				slug: `test-store-${Date.now()}`,
			},
		})
		testStoreId = store.id
	})

	afterAll(async () => {
		// Clean up test data
		if (testStoreId) {
			await prisma.storeMember.deleteMany({
				where: { storeId: testStoreId },
			})
			await prisma.store.delete({
				where: { id: testStoreId },
			})
		}
	})

	it('should create a StoreMember record when admin creates store owner', async () => {
		// Arrange
		const testUserId = `test-owner-${Date.now()}`
		const testStoreId_local = testStoreId

		// Act
		const storeMember = await prisma.storeMember.create({
			data: {
				userId: testUserId,
				storeId: testStoreId_local,
				role: 'ADMIN',
			},
		})

		// Assert
		expect(storeMember).toBeDefined()
		expect(storeMember.userId).toBe(testUserId)
		expect(storeMember.storeId).toBe(testStoreId_local)
		expect(storeMember.role).toBe('ADMIN')
	})

	it('should enforce unique constraint on userId and storeId', async () => {
		// Arrange
		const testUserId = `test-owner-${Date.now()}-dup`
		await prisma.storeMember.create({
			data: {
				userId: testUserId,
				storeId: testStoreId,
				role: 'ADMIN',
			},
		})

		// Act & Assert
		const result = await prisma.storeMember
			.create({
				data: {
					userId: testUserId,
					storeId: testStoreId,
					role: 'ADMIN',
				},
			})
			.catch((error) => {
				// Expected: unique constraint violation
				expect(error.code).toBe('P2002') // Unique constraint failed
				return null
			})

		expect(result).toBeNull()
	})

	it('should allow same user to manage multiple stores', async () => {
		// Arrange
		const testUserId = `test-multistore-${Date.now()}`
		const store2 = await prisma.store.create({
			data: {
				name: 'Test Store 2',
				slug: `test-store-2-${Date.now()}`,
			},
		})

		try {
			// Act
			const member1 = await prisma.storeMember.create({
				data: {
					userId: testUserId,
					storeId: testStoreId,
					role: 'ADMIN',
				},
			})

			const member2 = await prisma.storeMember.create({
				data: {
					userId: testUserId,
					storeId: store2.id,
					role: 'ADMIN',
				},
			})

			// Assert
			expect(member1.userId).toBe(testUserId)
			expect(member2.userId).toBe(testUserId)
			expect(member1.storeId).not.toBe(member2.storeId)

			// Query all stores for the user
			const userStores = await prisma.storeMember.findMany({
				where: { userId: testUserId },
			})
			expect(userStores).toHaveLength(2)
		} finally {
			// Cleanup
			await prisma.store.delete({ where: { id: store2.id } })
		}
	})
})
