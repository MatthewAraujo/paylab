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

describe('Customers admin API (E2E)', () => {
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

	test('operator can list customers scoped to their own store only', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const other = await authenticateStoreMember(app, prisma)

		await getOrCreateStoreCustomer.execute(store.id, 'customer-profile-list-1', {
			email: 'ana@example.com',
			name: 'Ana',
		})
		await getOrCreateStoreCustomer.execute(other.store.id, 'customer-profile-list-2', {
			email: 'bruno@example.com',
			name: 'Bruno',
		})

		const response = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/customers`)
			.set('Cookie', cookie)

		expect(response.statusCode).toBe(200)
		expect(response.body.total).toBe(1)
		expect(response.body.items).toHaveLength(1)
		expect(response.body.items[0].email).toBe('ana@example.com')
	})

	test('a store member cannot list another store customers by guessing its storeId', async () => {
		const { store: storeA } = await authenticateStoreMember(app, prisma)
		const { cookie: storeBToken } = await authenticateStoreMember(app, prisma)

		await getOrCreateStoreCustomer.execute(storeA.id, 'customer-profile-cross-1', {
			email: 'cross@example.com',
		})

		const response = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${storeA.id}/customers`)
			.set('Cookie', storeBToken)

		expect(response.statusCode).toBe(403)
	})

	test('operator can update a customer contact info', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const storeCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-contact',
			{
				email: 'carla@example.com',
				name: 'Carla',
			},
		)

		const response = await request(app.getHttpServer())
			.patch(`/api/v1/admin/stores/${store.id}/customers/${storeCustomer.id.toString()}`)
			.set('Cookie', cookie)
			.send({ name: 'Carla Updated', phone: '+5511999999999' })

		expect(response.statusCode).toBe(200)
		expect(response.body.name).toBe('Carla Updated')
		expect(response.body.phone).toBe('+5511999999999')
	})

	test('operator can add, update, remove, and set default addresses', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const storeCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-address',
			{
				email: 'diana@example.com',
			},
		)
		const customerId = storeCustomer.id.toString()
		const base = `/api/v1/admin/stores/${store.id}/customers/${customerId}`

		const addResponse = await request(app.getHttpServer())
			.post(`${base}/addresses`)
			.set('Cookie', cookie)
			.send({
				street: 'Rua A',
				number: '10',
				neighborhood: 'Centro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '02010-000',
				isDefault: true,
			})

		expect(addResponse.statusCode).toBe(201)
		expect(addResponse.body.addresses).toHaveLength(1)
		const addressId = addResponse.body.addresses[0].id

		const updateResponse = await request(app.getHttpServer())
			.patch(`${base}/addresses/${addressId}`)
			.set('Cookie', cookie)
			.send({ city: 'Campinas' })

		expect(updateResponse.statusCode).toBe(200)
		expect(updateResponse.body.addresses[0].city).toBe('Campinas')

		const secondAddResponse = await request(app.getHttpServer())
			.post(`${base}/addresses`)
			.set('Cookie', cookie)
			.send({
				street: 'Rua B',
				number: '20',
				neighborhood: 'Bairro',
				city: 'Sao Paulo',
				state: 'SP',
				postalCode: '02100-000',
			})
		const secondAddressId = secondAddResponse.body.addresses.find(
			(item: { id: string }) => item.id !== addressId,
		).id

		const setDefaultResponse = await request(app.getHttpServer())
			.post(`${base}/addresses/${secondAddressId}/default`)
			.set('Cookie', cookie)

		expect(setDefaultResponse.statusCode).toBe(200)
		const defaultAddress = setDefaultResponse.body.addresses.find(
			(item: { isDefault: boolean }) => item.isDefault,
		)
		expect(defaultAddress.id).toBe(secondAddressId)

		const removeResponse = await request(app.getHttpServer())
			.delete(`${base}/addresses/${addressId}`)
			.set('Cookie', cookie)

		expect(removeResponse.statusCode).toBe(200)
		expect(removeResponse.body.addresses).toHaveLength(1)
		expect(removeResponse.body.addresses[0].id).toBe(secondAddressId)
	})

	test('operator can suspend and reactivate a customer, and suspension is not soft-delete', async () => {
		const { store, cookie } = await authenticateStoreMember(app, prisma)
		const storeCustomer = await getOrCreateStoreCustomer.execute(
			store.id,
			'customer-profile-suspend',
			{
				email: 'erika@example.com',
			},
		)
		const base = `/api/v1/admin/stores/${store.id}/customers/${storeCustomer.id.toString()}`

		const suspendResponse = await request(app.getHttpServer())
			.post(`${base}/suspend`)
			.set('Cookie', cookie)

		expect(suspendResponse.statusCode).toBe(200)
		expect(suspendResponse.body.status).toBe('SUSPENDED')

		const suspendAgainResponse = await request(app.getHttpServer())
			.post(`${base}/suspend`)
			.set('Cookie', cookie)

		expect(suspendAgainResponse.statusCode).toBe(400)
		expect(suspendAgainResponse.body.code).toBe('INVALID_STORE_CUSTOMER_TRANSITION')
		expect(suspendAgainResponse.body.message).toBe('Transição de status do cliente inválida.')

		const listResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/stores/${store.id}/customers`)
			.set('Cookie', cookie)
		expect(listResponse.body.items.map((item: { id: string }) => item.id)).toContain(
			storeCustomer.id.toString(),
		)

		const reactivateResponse = await request(app.getHttpServer())
			.post(`${base}/reactivate`)
			.set('Cookie', cookie)

		expect(reactivateResponse.statusCode).toBe(200)
		expect(reactivateResponse.body.status).toBe('ACTIVE')
	})

	test('GetOrCreateStoreCustomer is idempotent for the same (storeId, customerProfileId)', async () => {
		const { store } = await authenticateStoreMember(app, prisma)

		const first = await getOrCreateStoreCustomer.execute(store.id, 'customer-profile-idempotent', {
			email: 'fabio@example.com',
		})
		const second = await getOrCreateStoreCustomer.execute(store.id, 'customer-profile-idempotent', {
			email: 'fabio-different-email@example.com',
		})

		expect(second.id.toString()).toBe(first.id.toString())
		expect(second.email).toBe('fabio@example.com')
	})
})
