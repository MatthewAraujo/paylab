import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

async function resetDatabase(prisma: PrismaService) {
	await prisma.auditLog.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
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

async function authenticateAdmin(
	app: INestApplication,
	prisma: PrismaService,
	input?: { email?: string },
) {
	const suffix = Math.random().toString(36).slice(2, 10)
	const email = input?.email ?? `admin-${suffix}@quintal.test`
	const slugBase = input?.email === 'other-admin@quintal.test' ? 'other-store' : 'quintal-agro-pet'

	const { store, user, cookie } = await authenticateStoreMember(app, prisma, {
		email,
		storeName: input?.email === 'other-admin@quintal.test' ? 'Other Store' : 'Quintal Agro Pet',
		storeSlug: `${slugBase}-${suffix}`,
	})

	return {
		store,
		admin: user,
		cookie,
	}
}

async function createVariant(
	prisma: PrismaService,
	storeId: string,
	input?: { sku?: string; name?: string },
) {
	const productSlug = `${(input?.sku ?? 'sku').toLowerCase()}-${Math.random().toString(36).slice(2, 8)}`
	const product = await prisma.product.create({
		data: {
			storeId: storeId,
			name: input?.name ? `${input.name} Product` : 'Racao Product',
			slug: productSlug,
			status: 'DRAFT',
		},
	})

	return prisma.productVariant.create({
		data: {
			storeId: storeId,
			productId: product.id,
			name: input?.name ?? 'Default Variant',
			sku: input?.sku ?? 'SKU-001',
			priceCents: 1990,
			attributes: {},
		},
	})
}

describe('Inventory admin API (E2E)', () => {
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

	test('admin can record movements, inspect stock, list stock, and read movement history', async () => {
		const { cookie, store } = await authenticateAdmin(app, prisma)
		const variant = await createVariant(prisma, store.id, {
			sku: 'DOG-FOOD-001',
			name: 'Dog Food 15kg',
		})

		const receiveResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${variant.id}/receive`)
			.set('Cookie', cookie)
			.send({
				quantity: 10,
				note: 'Initial inbound',
			})

		expect(receiveResponse.statusCode).toBe(201)
		expect(receiveResponse.body).toEqual({
			item: {
				id: expect.any(String),
				variantId: variant.id,
				variantSku: 'DOG-FOOD-001',
				variantName: 'Dog Food 15kg',
				availableQuantity: 10,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			},
			movement: {
				id: expect.any(String),
				variantId: variant.id,
				type: 'INBOUND',
				quantityDelta: 10,
				balanceAfter: 10,
				note: 'Initial inbound',
				createdAt: expect.any(String),
			},
		})

		const removeResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${variant.id}/remove`)
			.set('Cookie', cookie)
			.send({
				quantity: 3,
				note: 'Damaged package',
			})

		expect(removeResponse.statusCode).toBe(201)
		expect(removeResponse.body.movement).toEqual(
			expect.objectContaining({
				type: 'OUTBOUND',
				quantityDelta: -3,
				balanceAfter: 7,
				note: 'Damaged package',
			}),
		)
		expect(removeResponse.body.item.availableQuantity).toBe(7)

		const adjustResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${variant.id}/adjust`)
			.set('Cookie', cookie)
			.send({
				quantityDelta: -1,
				note: 'Cycle count correction',
			})

		expect(adjustResponse.statusCode).toBe(201)
		expect(adjustResponse.body.movement).toEqual(
			expect.objectContaining({
				type: 'ADJUSTMENT',
				quantityDelta: -1,
				balanceAfter: 6,
			}),
		)

		const returnResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${variant.id}/return`)
			.set('Cookie', cookie)
			.send({
				quantity: 2,
				note: 'Customer return',
			})

		expect(returnResponse.statusCode).toBe(201)
		expect(returnResponse.body.movement).toEqual(
			expect.objectContaining({
				type: 'RETURN',
				quantityDelta: 2,
				balanceAfter: 8,
				note: 'Customer return',
			}),
		)

		const detailResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/inventory/variants/${variant.id}`)
			.set('Cookie', cookie)

		expect(detailResponse.statusCode).toBe(200)
		expect(detailResponse.body).toEqual({
			id: expect.any(String),
			variantId: variant.id,
			variantSku: 'DOG-FOOD-001',
			variantName: 'Dog Food 15kg',
			availableQuantity: 8,
			createdAt: expect.any(String),
			updatedAt: expect.any(String),
		})

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/inventory/items')
			.set('Cookie', cookie)

		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toEqual([
			{
				id: expect.any(String),
				variantId: variant.id,
				variantSku: 'DOG-FOOD-001',
				variantName: 'Dog Food 15kg',
				availableQuantity: 8,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			},
		])

		const historyResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/inventory/variants/${variant.id}/movements`)
			.set('Cookie', cookie)

		expect(historyResponse.statusCode).toBe(200)
		expect(historyResponse.body.items).toEqual([
			expect.objectContaining({
				type: 'INBOUND',
				quantityDelta: 10,
				balanceAfter: 10,
				note: 'Initial inbound',
			}),
			expect.objectContaining({
				type: 'OUTBOUND',
				quantityDelta: -3,
				balanceAfter: 7,
				note: 'Damaged package',
			}),
			expect.objectContaining({
				type: 'ADJUSTMENT',
				quantityDelta: -1,
				balanceAfter: 6,
				note: 'Cycle count correction',
			}),
			expect.objectContaining({
				type: 'RETURN',
				quantityDelta: 2,
				balanceAfter: 8,
				note: 'Customer return',
			}),
		])
	})

	test('invalid outbound quantity is rejected and does not persist movement history', async () => {
		const { cookie, store } = await authenticateAdmin(app, prisma)
		const variant = await createVariant(prisma, store.id, {
			sku: 'DOG-FOOD-002',
			name: 'Dog Food 20kg',
		})

		await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${variant.id}/receive`)
			.set('Cookie', cookie)
			.send({
				quantity: 2,
			})
			.expect(201)

		const invalidResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${variant.id}/remove`)
			.set('Cookie', cookie)
			.send({
				quantity: 3,
			})

		expect(invalidResponse.statusCode).toBe(400)
		// The raw domain error message ("Inventory balance cannot become negative.")
		// must never reach the operator verbatim — it's translated to a structured,
		// PT-BR-friendly body instead. See T5.
		expect(invalidResponse.body).toEqual({
			code: 'INVENTORY_BALANCE_NEGATIVE',
			message: 'Não há estoque suficiente para atender esta movimentação.',
		})

		const detailResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/inventory/variants/${variant.id}`)
			.set('Cookie', cookie)

		expect(detailResponse.statusCode).toBe(200)
		expect(detailResponse.body.availableQuantity).toBe(2)

		const historyResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/inventory/variants/${variant.id}/movements`)
			.set('Cookie', cookie)

		expect(historyResponse.statusCode).toBe(200)
		expect(historyResponse.body.items).toHaveLength(1)
		expect(historyResponse.body.items[0].type).toBe('INBOUND')
	})

	test('inventory routes stay isolated between stores', async () => {
		const owner = await authenticateAdmin(app, prisma)
		const foreignOwner = await authenticateAdmin(app, prisma, {
			email: 'other-admin@quintal.test',
		})

		const ownVariant = await createVariant(prisma, owner.store.id, {
			sku: 'OWN-001',
			name: 'Own Variant',
		})
		const foreignVariant = await createVariant(prisma, foreignOwner.store.id, {
			sku: 'FOREIGN-001',
			name: 'Foreign Variant',
		})

		await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${ownVariant.id}/receive`)
			.set('Cookie', owner.cookie)
			.send({
				quantity: 5,
			})
			.expect(201)

		await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${foreignVariant.id}/receive`)
			.set('Cookie', foreignOwner.cookie)
			.send({
				quantity: 9,
			})
			.expect(201)

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/inventory/items')
			.set('Cookie', owner.cookie)

		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toHaveLength(1)
		expect(listResponse.body.items[0]).toEqual(
			expect.objectContaining({
				variantId: ownVariant.id,
				variantSku: 'OWN-001',
				availableQuantity: 5,
			}),
		)

		await request(app.getHttpServer())
			.get(`/api/v1/admin/inventory/variants/${foreignVariant.id}`)
			.set('Cookie', owner.cookie)
			.expect(404)

		await request(app.getHttpServer())
			.get(`/api/v1/admin/inventory/variants/${foreignVariant.id}/movements`)
			.set('Cookie', owner.cookie)
			.expect(404)

		await request(app.getHttpServer())
			.post(`/api/v1/admin/inventory/variants/${foreignVariant.id}/receive`)
			.set('Cookie', owner.cookie)
			.send({
				quantity: 1,
			})
			.expect(404)
	})
})
