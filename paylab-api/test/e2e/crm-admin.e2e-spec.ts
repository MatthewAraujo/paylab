import { GetOrCreateStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/get-or-create-store-customer'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.cRMInteraction.deleteMany()
	await prisma.cRMProfile.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.auditLog.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.customerProfile.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

describe('CRM admin API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
	let getOrCreateStoreCustomer: GetOrCreateStoreCustomerUseCase

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		}).compile()

		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)
		getOrCreateStoreCustomer = moduleRef.get(GetOrCreateStoreCustomerUseCase)

		await app.init()
	})

	beforeEach(async () => {
		await resetDatabase(prisma)
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	test('operator can change the segment, rejecting an invalid enum value with 400', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const storeCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-segment',
			{
				email: 'ana@example.com',
			},
		)
		const base = `/api/v1/admin/stores/${store.id}/crm/profiles/${storeCustomer.id.toString()}`

		const response = await request(app.getHttpServer())
			.put(`${base}/segment`)
			.set('Cookie', cookie)
			.send({ segment: 'VIP' })

		expect(response.statusCode).toBe(200)
		expect(response.body.segment).toBe('VIP')

		const invalidResponse = await request(app.getHttpServer())
			.put(`${base}/segment`)
			.set('Cookie', cookie)
			.send({ segment: 'NOT_A_SEGMENT' })

		expect(invalidResponse.statusCode).toBe(400)
	})

	test('operator can add and remove tags idempotently', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const storeCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-tags',
			{
				email: 'bruno@example.com',
			},
		)
		const base = `/api/v1/admin/stores/${store.id}/crm/profiles/${storeCustomer.id.toString()}`

		await request(app.getHttpServer())
			.put(`${base}/tags`)
			.set('Cookie', cookie)
			.send({ tag: 'vip', action: 'add' })

		await request(app.getHttpServer())
			.put(`${base}/tags`)
			.set('Cookie', cookie)
			.send({ tag: 'vip', action: 'add' })

		const afterAdd = await request(app.getHttpServer()).get(base).set('Cookie', cookie)
		expect(afterAdd.body.tags).toEqual(['vip'])

		await request(app.getHttpServer())
			.put(`${base}/tags`)
			.set('Cookie', cookie)
			.send({ tag: 'vip', action: 'remove' })

		const afterRemove = await request(app.getHttpServer()).get(base).set('Cookie', cookie)
		expect(afterRemove.body.tags).toEqual([])
	})

	test('operator can record interactions and list them chronologically, with no edit/delete route', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const storeCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-interactions',
			{ email: 'carla@example.com' },
		)
		const base = `/api/v1/admin/stores/${store.id}/crm/profiles/${storeCustomer.id.toString()}/interactions`

		const first = await request(app.getHttpServer())
			.post(base)
			.set('Cookie', cookie)
			.send({ type: 'NOTE', channel: 'SYSTEM', content: 'First contact' })
		expect(first.statusCode).toBe(201)

		const second = await request(app.getHttpServer())
			.post(base)
			.set('Cookie', cookie)
			.send({ type: 'PHONE_CALL', channel: 'PHONE', content: 'Follow-up call' })
		expect(second.statusCode).toBe(201)

		const listResponse = await request(app.getHttpServer()).get(base).set('Cookie', cookie)

		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toHaveLength(2)
		expect(listResponse.body.items[0].content).toBe('First contact')
		expect(listResponse.body.items[1].content).toBe('Follow-up call')

		const patchResponse = await request(app.getHttpServer())
			.patch(base)
			.set('Cookie', cookie)
			.send({ content: 'edited' })
		expect(patchResponse.statusCode).toBe(404)

		const deleteResponse = await request(app.getHttpServer()).delete(base).set('Cookie', cookie)
		expect(deleteResponse.statusCode).toBe(404)
	})

	test('operator can filter customers by segment and by tag, scoped to their own store', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)

		const vipCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-filter-vip',
			{
				email: 'diana@example.com',
			},
		)
		await getOrCreateStoreCustomer.execute(store.id, 'customer-profile-filter-new', {
			email: 'erika@example.com',
		})
		const otherStoreVip = await getOrCreateStoreCustomer.execute(
			other.store.id,
			'customer-profile-filter-other-vip',
			{ email: 'other-vip@example.com' },
		)

		await request(app.getHttpServer())
			.put(`/api/v1/admin/stores/${store.id}/crm/profiles/${vipCustomer.id.toString()}/segment`)
			.set('Cookie', cookie)
			.send({ segment: 'VIP' })
		await request(app.getHttpServer())
			.put(`/api/v1/admin/stores/${store.id}/crm/profiles/${vipCustomer.id.toString()}/tags`)
			.set('Cookie', cookie)
			.send({ tag: 'outreach', action: 'add' })
		await request(app.getHttpServer())
			.put(
				`/api/v1/admin/stores/${other.store.id}/crm/profiles/${otherStoreVip.id.toString()}/segment`,
			)
			.set('Cookie', other.cookie)
			.send({ segment: 'VIP' })

		const bySegmentResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/crm/customers?segment=VIP`)
			.set('Cookie', cookie)
		expect(bySegmentResponse.statusCode).toBe(200)
		expect(bySegmentResponse.body.total).toBe(1)
		expect(bySegmentResponse.body.items[0].email).toBe('diana@example.com')

		const byTagResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/crm/customers?tag=outreach`)
			.set('Cookie', cookie)
		expect(byTagResponse.statusCode).toBe(200)
		expect(byTagResponse.body.total).toBe(1)
		expect(byTagResponse.body.items[0].email).toBe('diana@example.com')

		const crossStoreResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${other.store.id}/crm/customers?segment=VIP`)
			.set('Cookie', cookie)
		expect(crossStoreResponse.statusCode).toBe(403)
	})
})
