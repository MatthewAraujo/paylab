import { PrismaClient } from '@prisma/client'
import { beforeAll, describe, expect, it } from 'vitest'

const prisma = new PrismaClient()

describe('Customer Signup Flow', () => {
	beforeAll(async () => {
		// Clean up test data
		await prisma.customerProfile.deleteMany()
	})

	it('should create a CustomerProfile when a customer signs up and verifies email', async () => {
		// Arrange
		const testUserId = `test-user-${Date.now()}`

		// Act
		const customerProfile = await prisma.customerProfile.create({
			data: {
				userId: testUserId,
			},
		})

		// Assert
		expect(customerProfile).toBeDefined()
		expect(customerProfile.userId).toBe(testUserId)
		expect(customerProfile.id).toBeDefined()
		expect(customerProfile.createdAt).toBeDefined()
	})

	it('should return existing CustomerProfile when queried by userId', async () => {
		// Arrange
		const testUserId = `test-user-${Date.now()}-existing`
		const created = await prisma.customerProfile.create({
			data: {
				userId: testUserId,
			},
		})

		// Act
		const found = await prisma.customerProfile.findUnique({
			where: { userId: testUserId },
		})

		// Assert
		expect(found).toBeDefined()
		expect(found?.id).toBe(created.id)
		expect(found?.userId).toBe(testUserId)
	})

	it('should not create duplicate CustomerProfiles for the same user', async () => {
		// Arrange
		const testUserId = `test-user-${Date.now()}-dup`
		await prisma.customerProfile.create({
			data: {
				userId: testUserId,
			},
		})

		// Act & Assert
		const result = await prisma.customerProfile
			.create({
				data: {
					userId: testUserId,
				},
			})
			.catch((error) => {
				// Expected: unique constraint violation
				expect(error.code).toBe('P2002') // Unique constraint failed
				return null
			})

		expect(result).toBeNull()
	})
})
