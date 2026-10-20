import { afterAll, beforeEach } from 'vitest'
import { prisma, resetDatabase } from './database'

beforeEach(async () => {
	await resetDatabase()
})

afterAll(async () => {
	await prisma.$disconnect()
})
