import { afterAll, afterEach, beforeEach } from 'vitest'
import { prisma, resetDatabase } from './database'
import { assertGlobalInvariants } from './invariants'

beforeEach(async () => {
	await resetDatabase()
})

afterEach(async () => {
	await assertGlobalInvariants()
})

afterAll(async () => {
	await prisma.$disconnect()
})
