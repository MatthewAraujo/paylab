import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticatePlatformAdmin, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.storeMemberProvisioningLog.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.platformAdmin.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

describe('Admin store members provisioning (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)

		await app.init()
	})

	beforeEach(async () => {
		await resetDatabase(prisma)
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	test('a store member provisioned via the admin endpoint gets no CustomerProfile', async () => {
		const { cookie } = await authenticatePlatformAdmin(app, prisma)
		const store = await prisma.store.create({
			data: { name: 'Quintal Provisioning', slug: 'quintal-provisioning' },
		})

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/store-members')
			.set('Cookie', cookie)
			.send({ email: 'new-owner@quintal.test', storeId: store.id })

		expect(response.statusCode).toBe(201)
		expect(response.body.success).toBe(true)

		const createdUserId = response.body.storeMembers[0].userId as string
		const customerProfile = await prisma.customerProfile.findUnique({
			where: { userId: createdUserId },
		})
		expect(customerProfile).toBeNull()

		const storeMember = await prisma.storeMember.findUnique({
			where: { userId_storeId: { userId: createdUserId, storeId: store.id } },
		})
		expect(storeMember).not.toBeNull()
	})

	test('a public sign-up cannot use isAdminProvisioned to skip its own CustomerProfile creation', async () => {
		// Regression test for a mass-assignment gap: isAdminProvisioned used to
		// be a Better Auth additionalField with `input: true`, which any public
		// caller could set on the real sign-up endpoint.
		const response = await request(app.getHttpServer()).post('/api/auth/sign-up/email').send({
			email: 'self-provisioned@quintal.test',
			password: 'password123',
			name: 'Self Provisioned',
			isAdminProvisioned: true,
		})

		expect(response.statusCode).toBe(200)

		const customerProfile = await prisma.customerProfile.findUnique({
			where: { userId: response.body.user.id },
		})
		expect(customerProfile).not.toBeNull()
	})
})
