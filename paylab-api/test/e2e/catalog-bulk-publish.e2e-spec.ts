import { randomUUID } from 'node:crypto'
import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Uploader } from '@/shared/storage/uploader'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { FakeUploader } from '../storage/fake-uploader'
import {
	authenticateCustomer,
	authenticateStoreMember,
	resetBetterAuthTables,
} from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.auditLog.deleteMany()
	await prisma.productImage.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.attachment.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.storeMembership.deleteMany()
	await prisma.user.deleteMany()
	await resetBetterAuthTables(prisma)
	await prisma.store.deleteMany()
}

describe('Catalog bulk publish API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(Uploader)
			.useValue(new FakeUploader())
			.compile()

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

	async function authenticate() {
		return authenticateStoreMember(app, prisma, {
			storeName: 'Quintal Bulk Publish',
			storeSlug: 'quintal-bulk-publish',
		})
	}

	async function createDraftProduct(cookie: string, slug: string) {
		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
			.send({ name: slug, slug })

		expect(response.statusCode).toBe(201)
		expect(response.body.status).toBe('DRAFT')

		return response.body.id as string
	}

	test('publishes many draft products in one call and reports none skipped', async () => {
		const { cookie } = await authenticate()

		const ids = await Promise.all([
			createDraftProduct(cookie, 'racao-a'),
			createDraftProduct(cookie, 'racao-b'),
			createDraftProduct(cookie, 'racao-c'),
		])

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/publish')
			.set('Cookie', cookie)
			.send({ productIds: ids })

		expect(response.statusCode).toBe(200)
		expect(response.body.skipped).toEqual([])
		expect(response.body.published).toEqual(
			expect.arrayContaining(ids.map((id) => ({ id, status: 'ACTIVE' }))),
		)
		expect(response.body.published).toHaveLength(3)

		const list = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)

		expect(list.statusCode).toBe(200)
		for (const id of ids) {
			expect(list.body.items).toEqual(
				expect.arrayContaining([expect.objectContaining({ id, status: 'ACTIVE' })]),
			)
		}
	})

	test('publishes the eligible ids and skips one that is already ACTIVE', async () => {
		const { cookie } = await authenticate()

		const activeId = await createDraftProduct(cookie, 'racao-active')
		const publishOne = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${activeId}/publish`)
			.set('Cookie', cookie)
		expect(publishOne.statusCode).toBe(200)

		const draftA = await createDraftProduct(cookie, 'racao-draft-a')
		const draftB = await createDraftProduct(cookie, 'racao-draft-b')

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/publish')
			.set('Cookie', cookie)
			.send({ productIds: [activeId, draftA, draftB] })

		expect(response.statusCode).toBe(200)
		expect(response.body.published).toEqual(
			expect.arrayContaining([
				{ id: draftA, status: 'ACTIVE' },
				{ id: draftB, status: 'ACTIVE' },
			]),
		)
		expect(response.body.published).toHaveLength(2)
		expect(response.body.skipped).toEqual([
			expect.objectContaining({
				id: activeId,
				reason: 'not_draft',
				currentStatus: 'ACTIVE',
			}),
		])
	})

	test('rejects an empty id list with 400', async () => {
		const { cookie } = await authenticate()

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/publish')
			.set('Cookie', cookie)
			.send({ productIds: [] })

		expect(response.statusCode).toBe(400)
	})

	test('rejects a list above the 200-id cap with 400', async () => {
		const { cookie } = await authenticate()

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/publish')
			.set('Cookie', cookie)
			.send({ productIds: Array.from({ length: 201 }, () => randomUUID()) })

		expect(response.statusCode).toBe(400)
	})

	test('requires an authenticated store-member session', async () => {
		const anonymous = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/publish')
			.send({ productIds: [randomUUID()] })

		expect([401, 403]).toContain(anonymous.statusCode)

		const { cookie } = await authenticateCustomer(app, prisma)
		const nonMember = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/publish')
			.set('Cookie', cookie)
			.send({ productIds: [randomUUID()] })

		expect([401, 403]).toContain(nonMember.statusCode)
	})
})
