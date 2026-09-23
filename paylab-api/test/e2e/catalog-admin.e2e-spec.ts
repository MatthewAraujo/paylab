import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Uploader } from '@/shared/storage/uploader'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { TINY_PNG_BUFFER } from '../fixtures/tiny-png'
import { FakeUploader } from '../storage/fake-uploader'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

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

async function authenticateAdmin(app: INestApplication, prisma: PrismaService) {
	const { store, user, cookie } = await authenticateStoreMember(app, prisma, {
		storeName: 'Quintal Agro Pet',
		storeSlug: 'quintal-agro-pet',
	})

	return {
		store,
		admin: user,
		cookie,
	}
}

async function uploadAttachment(app: INestApplication, cookie: string, fileName: string) {
	return request(app.getHttpServer())
		.post('/api/v1/admin/attachments')
		.set('Cookie', cookie)
		.attach('file', TINY_PNG_BUFFER, {
			filename: fileName,
			contentType: 'image/png',
		})
}

function findUploadedUrl(fakeUploader: FakeUploader, fileName: string) {
	const upload = [...fakeUploader.uploads].reverse().find((item) => item.fileName === fileName)

	if (!upload) {
		throw new Error(`Missing uploaded file record for ${fileName}`)
	}

	return upload.url
}

describe('Catalog admin API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
	let fakeUploader: FakeUploader

	beforeAll(async () => {
		fakeUploader = new FakeUploader()
		const moduleRef = await Test.createTestingModule({
			imports: [AppModule],
		})
			.overrideProvider(Uploader)
			.useValue(fakeUploader)
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

	test('admin can upload a catalog attachment and receive an attachment id', async () => {
		const { cookie } = await authenticateAdmin(app, prisma)

		const response = await uploadAttachment(app, cookie, 'catalog-image.png')

		expect(response.statusCode).toBe(201)
		expect(response.body).toEqual({
			attachmentId: expect.any(String),
		})
		expect(fakeUploader.uploads).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					fileName: 'catalog-image.png',
					url: expect.any(String),
				}),
			]),
		)
	})

	test('admin upload rejects unsupported attachment types', async () => {
		const { cookie } = await authenticateAdmin(app, prisma)

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/attachments')
			.set('Cookie', cookie)
			.attach('file', Buffer.from('not-an-image'), {
				filename: 'catalog.txt',
				contentType: 'text/plain',
			})

		expect(response.statusCode).toBe(400)
	})

	test('admin can create, update, deactivate, reactivate, archive, and list brands', async () => {
		const { cookie, store } = await authenticateAdmin(app, prisma)
		const attachmentResponse = await uploadAttachment(app, cookie, 'premier.png')
		const logoUrl = findUploadedUrl(fakeUploader, 'premier.png')

		expect(attachmentResponse.statusCode).toBe(201)

		const createResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/brands')
			.set('Cookie', cookie)
			.send({
				name: 'Premier',
				slug: 'premier',
			})

		expect(createResponse.statusCode).toBe(201)
		expect(createResponse.body).toEqual({
			id: expect.any(String),
			name: 'Premier',
			slug: 'premier',
			status: 'ACTIVE',
			logoAttachmentId: null,
			logoUrl: null,
			createdAt: expect.any(String),
			updatedAt: null,
			archivedAt: null,
		})

		const updateResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/brands/${createResponse.body.id}`)
			.set('Cookie', cookie)
			.send({
				name: 'Premier Pet',
				logoAttachmentId: attachmentResponse.body.attachmentId,
			})

		expect(updateResponse.statusCode).toBe(200)
		expect(updateResponse.body).toEqual(
			expect.objectContaining({
				id: createResponse.body.id,
				name: 'Premier Pet',
				slug: 'premier',
				logoAttachmentId: attachmentResponse.body.attachmentId,
				logoUrl: logoUrl,
				status: 'ACTIVE',
				updatedAt: expect.any(String),
			}),
		)

		const deactivateResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/brands/${createResponse.body.id}/deactivate`)
			.set('Cookie', cookie)

		expect(deactivateResponse.statusCode).toBe(200)
		expect(deactivateResponse.body.status).toBe('INACTIVE')

		const reactivateResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/brands/${createResponse.body.id}/activate`)
			.set('Cookie', cookie)

		expect(reactivateResponse.statusCode).toBe(200)
		expect(reactivateResponse.body.status).toBe('ACTIVE')

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/brands')
			.set('Cookie', cookie)

		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toEqual([
			expect.objectContaining({
				id: createResponse.body.id,
				name: 'Premier Pet',
				slug: 'premier',
				status: 'ACTIVE',
			}),
		])

		await prisma.brand.create({
			data: {
				storeId: store.id,
				name: 'Premier Duplicated',
				slug: 'shared-brand',
			},
		})

		const duplicateSameStore = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/brands')
			.set('Cookie', cookie)
			.send({
				name: 'Duplicate',
				slug: 'shared-brand',
			})

		expect(duplicateSameStore.statusCode).toBe(409)
		expect(duplicateSameStore.body).toEqual({
			code: 'CATALOG_CONFLICT',
			message:
				'Já existe um registro de catálogo com esses dados. Verifique as informações e tente novamente.',
		})

		const foreignStore = await prisma.store.create({
			data: {
				name: 'Other Store',
				slug: 'other-store',
			},
		})
		await prisma.brand.create({
			data: {
				storeId: foreignStore.id,
				name: 'Foreign Brand',
				slug: 'shared-brand',
			},
		})

		const archiveResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/brands/${createResponse.body.id}/archive`)
			.set('Cookie', cookie)

		expect(archiveResponse.statusCode).toBe(200)
		expect(archiveResponse.body.status).toBe('ARCHIVED')

		const updateArchivedResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/brands/${createResponse.body.id}`)
			.set('Cookie', cookie)
			.send({
				name: 'Should Fail',
			})

		expect(updateArchivedResponse.statusCode).toBe(400)
		expect(updateArchivedResponse.body).toEqual({
			code: 'ARCHIVED_CATALOG_ENTITY',
			message: 'Itens arquivados do catálogo não podem ser editados.',
		})
	})

	test('admin can create, update, archive, and list categories with server-generated slugs while rejecting cycles', async () => {
		const { cookie } = await authenticateAdmin(app, prisma)
		const attachmentResponse = await uploadAttachment(app, cookie, 'racoes-secas.png')
		const imageUrl = findUploadedUrl(fakeUploader, 'racoes-secas.png')

		expect(attachmentResponse.statusCode).toBe(201)

		const rootResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/categories')
			.set('Cookie', cookie)
			.send({
				name: 'Caes',
			})

		expect(rootResponse.statusCode).toBe(201)
		expect(rootResponse.body.slug).toBe('caes')

		const childResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/categories')
			.set('Cookie', cookie)
			.send({
				name: 'Racoes',
				parentCategoryId: rootResponse.body.id,
			})

		expect(childResponse.statusCode).toBe(201)
		expect(childResponse.body.parentCategoryId).toBe(rootResponse.body.id)
		expect(childResponse.body.slug).toBe('caes-racoes')

		const updateResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/categories/${childResponse.body.id}`)
			.set('Cookie', cookie)
			.send({
				name: 'Racoes Secas',
				imageAttachmentId: attachmentResponse.body.attachmentId,
			})

		expect(updateResponse.statusCode).toBe(200)
		expect(updateResponse.body.name).toBe('Racoes Secas')
		// The slug is immutable after creation — it must not change even though the
		// name did, since category slugs are part of public storefront URLs.
		expect(updateResponse.body.slug).toBe('caes-racoes')
		expect(updateResponse.body.imageAttachmentId).toBe(attachmentResponse.body.attachmentId)
		expect(updateResponse.body.imageUrl).toBe(imageUrl)

		const cycleResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/categories/${rootResponse.body.id}`)
			.set('Cookie', cookie)
			.send({
				parentCategoryId: childResponse.body.id,
			})

		expect(cycleResponse.statusCode).toBe(400)
		expect(cycleResponse.body).toEqual({
			code: 'CATEGORY_CYCLE',
			message: 'Não é possível criar um ciclo entre categorias.',
		})

		const duplicateNameResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/categories')
			.set('Cookie', cookie)
			.send({ name: 'Caes' })

		// Slugs are server-generated, not user input, so a second category with the
		// same generated base slug is never a 409 — it just gets a numeric suffix.
		expect(duplicateNameResponse.statusCode).toBe(201)
		expect(duplicateNameResponse.body.slug).toBe('caes-2')

		const deactivateResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/categories/${childResponse.body.id}/deactivate`)
			.set('Cookie', cookie)

		expect(deactivateResponse.statusCode).toBe(200)
		expect(deactivateResponse.body.status).toBe('INACTIVE')

		const activateResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/categories/${childResponse.body.id}/activate`)
			.set('Cookie', cookie)

		expect(activateResponse.statusCode).toBe(200)
		expect(activateResponse.body.status).toBe('ACTIVE')

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/categories')
			.set('Cookie', cookie)

		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: rootResponse.body.id,
					name: 'Caes',
					parentCategoryId: null,
				}),
				expect.objectContaining({
					id: childResponse.body.id,
					name: 'Racoes Secas',
					parentCategoryId: rootResponse.body.id,
				}),
			]),
		)

		const archiveResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/categories/${childResponse.body.id}/archive`)
			.set('Cookie', cookie)

		expect(archiveResponse.statusCode).toBe(200)
		expect(archiveResponse.body.status).toBe('ARCHIVED')
	})

	test('admin can create, update, publish, deactivate, reactivate, archive, and query products', async () => {
		const { cookie, store } = await authenticateAdmin(app, prisma)
		const frontAttachmentResponse = await uploadAttachment(app, cookie, 'product-front.png')
		const sideAttachmentResponse = await uploadAttachment(app, cookie, 'product-side.png')
		const updatedAttachmentResponse = await uploadAttachment(app, cookie, 'product-updated.png')
		const frontImageUrl = findUploadedUrl(fakeUploader, 'product-front.png')
		const sideImageUrl = findUploadedUrl(fakeUploader, 'product-side.png')
		const updatedImageUrl = findUploadedUrl(fakeUploader, 'product-updated.png')

		const brand = await prisma.brand.create({
			data: {
				storeId: store.id,
				name: 'Premier',
				slug: 'premier',
			},
		})

		const primaryCategory = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Caes',
				slug: 'caes',
			},
		})
		const secondaryCategory = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Premium',
				slug: 'premium',
			},
		})
		const inactiveCategory = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Inativa',
				slug: 'inativa',
				status: 'INACTIVE',
			},
		})

		const createResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
			.send({
				name: 'Racao Premium Caes Adultos',
				slug: 'racao-premium-caes-adultos',
				description: 'Produto editorial do catalogo',
				brandId: brand.id,
				primaryCategoryId: primaryCategory.id,
				categoryIds: [primaryCategory.id, secondaryCategory.id],
				images: [
					{
						attachmentId: frontAttachmentResponse.body.attachmentId,
						altText: 'Frontal',
						isPrimary: true,
					},
					{
						attachmentId: sideAttachmentResponse.body.attachmentId,
						altText: 'Lateral',
					},
				],
			})

		expect(createResponse.statusCode).toBe(201)
		expect(createResponse.body).toEqual(
			expect.objectContaining({
				name: 'Racao Premium Caes Adultos',
				slug: 'racao-premium-caes-adultos',
				status: 'DRAFT',
				brandId: brand.id,
				primaryCategoryId: primaryCategory.id,
				categoryIds: [primaryCategory.id, secondaryCategory.id],
				variants: [],
				images: [
					expect.objectContaining({
						attachmentId: frontAttachmentResponse.body.attachmentId,
						url: frontImageUrl,
						altText: 'Frontal',
						position: 0,
						isPrimary: true,
					}),
					expect.objectContaining({
						attachmentId: sideAttachmentResponse.body.attachmentId,
						url: sideImageUrl,
						altText: 'Lateral',
						position: 1,
						isPrimary: false,
					}),
				],
			}),
		)

		const invalidPrimaryCategoryResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
			.send({
				name: 'Produto Invalido',
				slug: 'produto-invalido',
				primaryCategoryId: secondaryCategory.id,
				categoryIds: [primaryCategory.id],
			})

		expect(invalidPrimaryCategoryResponse.statusCode).toBe(400)
		expect(invalidPrimaryCategoryResponse.body).toEqual({
			code: 'INVALID_PRIMARY_CATEGORY',
			message: 'A categoria principal deve estar entre as categorias atribuídas.',
		})

		const inactiveCategoryResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
			.send({
				name: 'Produto Invalido 2',
				slug: 'produto-invalido-2',
				primaryCategoryId: inactiveCategory.id,
				categoryIds: [inactiveCategory.id],
			})

		expect(inactiveCategoryResponse.statusCode).toBe(400)

		await prisma.product.create({
			data: {
				storeId: store.id,
				name: 'Produto Duplicado',
				slug: 'produto-duplicado',
			},
		})

		const duplicateSlugResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
			.send({
				name: 'Produto Duplicado 2',
				slug: 'produto-duplicado',
			})

		expect(duplicateSlugResponse.statusCode).toBe(409)

		const updateResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/products/${createResponse.body.id}`)
			.set('Cookie', cookie)
			.send({
				name: 'Racao Premium Caes Adultos 15kg',
				description: 'Descricao atualizada',
				brandId: null,
				images: [
					{
						attachmentId: updatedAttachmentResponse.body.attachmentId,
						altText: 'Nova frontal',
						isPrimary: true,
					},
				],
			})

		expect(updateResponse.statusCode).toBe(200)
		expect(updateResponse.body).toEqual(
			expect.objectContaining({
				id: createResponse.body.id,
				name: 'Racao Premium Caes Adultos 15kg',
				description: 'Descricao atualizada',
				brandId: null,
				images: [
					expect.objectContaining({
						attachmentId: updatedAttachmentResponse.body.attachmentId,
						url: updatedImageUrl,
						altText: 'Nova frontal',
						position: 0,
						isPrimary: true,
					}),
				],
			}),
		)

		// Regression coverage for the admin client's real request shape: it sends only
		// `primaryCategoryId` (no `categoryIds`) on update. This must persist and must
		// replace (not add to) the product's category set, then show up on a
		// published product's public storefront read.
		const categoryOnlyUpdateResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/products/${createResponse.body.id}`)
			.set('Cookie', cookie)
			.send({
				primaryCategoryId: secondaryCategory.id,
			})

		expect(categoryOnlyUpdateResponse.statusCode).toBe(200)
		expect(categoryOnlyUpdateResponse.body).toEqual(
			expect.objectContaining({
				id: createResponse.body.id,
				primaryCategoryId: secondaryCategory.id,
				categoryIds: [secondaryCategory.id],
			}),
		)

		const publishForStorefrontResponse = await request(app.getHttpServer())
			.patch(`/api/v1/admin/catalog/products/${createResponse.body.id}`)
			.set('Cookie', cookie)
			.send({ status: 'ACTIVE' })

		expect(publishForStorefrontResponse.statusCode).toBe(200)
		expect(publishForStorefrontResponse.body.status).toBe('ACTIVE')

		const storefrontProductResponse = await request(app.getHttpServer()).get(
			`/api/v1/storefront/products/${createResponse.body.slug}?store=${store.slug}`,
		)

		expect(storefrontProductResponse.statusCode).toBe(200)
		expect(storefrontProductResponse.body.primaryCategory).toEqual(
			expect.objectContaining({ slug: secondaryCategory.slug }),
		)

		await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/deactivate`)
			.set('Cookie', cookie)

		const addVariantResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/variants`)
			.set('Cookie', cookie)
			.send({
				name: '15kg',
				sku: 'PREMIER-15KG',
				priceCents: 24990,
				costCents: 18990,
				attributes: {
					weight: '15kg',
					lifeStage: 'adulto',
				},
			})

		expect(addVariantResponse.statusCode).toBe(201)
		expect(addVariantResponse.body).toEqual(
			expect.objectContaining({
				name: '15kg',
				sku: 'PREMIER-15KG',
				status: 'ACTIVE',
				priceCents: 24990,
				costCents: 18990,
				attributes: {
					weight: '15kg',
					lifeStage: 'adulto',
				},
			}),
		)

		const duplicateSkuResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/variants`)
			.set('Cookie', cookie)
			.send({
				name: '20kg',
				sku: 'PREMIER-15KG',
				priceCents: 27990,
				attributes: {
					weight: '20kg',
				},
			})

		expect(duplicateSkuResponse.statusCode).toBe(409)

		const updateVariantResponse = await request(app.getHttpServer())
			.patch(
				`/api/v1/admin/catalog/products/${createResponse.body.id}/variants/${addVariantResponse.body.id}`,
			)
			.set('Cookie', cookie)
			.send({
				name: '15kg atualizado',
				sku: 'PREMIER-15KG-NEW',
				priceCents: 25990,
				costCents: 19990,
				attributes: {
					weight: '15kg',
					lifeStage: 'adulto',
					line: 'super premium',
				},
			})

		expect(updateVariantResponse.statusCode).toBe(200)
		expect(updateVariantResponse.body).toEqual(
			expect.objectContaining({
				id: addVariantResponse.body.id,
				name: '15kg atualizado',
				sku: 'PREMIER-15KG-NEW',
				priceCents: 25990,
			}),
		)

		const disableVariantResponse = await request(app.getHttpServer())
			.post(
				`/api/v1/admin/catalog/products/${createResponse.body.id}/variants/${addVariantResponse.body.id}/deactivate`,
			)
			.set('Cookie', cookie)

		expect(disableVariantResponse.statusCode).toBe(200)
		expect(disableVariantResponse.body.status).toBe('INACTIVE')

		const publishResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/publish`)
			.set('Cookie', cookie)

		expect(publishResponse.statusCode).toBe(200)
		expect(publishResponse.body.status).toBe('ACTIVE')

		const invalidArchiveWhileActive = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/archive`)
			.set('Cookie', cookie)

		expect(invalidArchiveWhileActive.statusCode).toBe(400)

		const deactivateResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/deactivate`)
			.set('Cookie', cookie)

		expect(deactivateResponse.statusCode).toBe(200)
		expect(deactivateResponse.body.status).toBe('INACTIVE')

		const reactivateResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/reactivate`)
			.set('Cookie', cookie)

		expect(reactivateResponse.statusCode).toBe(200)
		expect(reactivateResponse.body.status).toBe('ACTIVE')

		await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/deactivate`)
			.set('Cookie', cookie)

		const archiveResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createResponse.body.id}/archive`)
			.set('Cookie', cookie)

		expect(archiveResponse.statusCode).toBe(200)
		expect(archiveResponse.body.status).toBe('ARCHIVED')

		const getResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/catalog/products/${createResponse.body.id}`)
			.set('Cookie', cookie)

		expect(getResponse.statusCode).toBe(200)
		expect(getResponse.body).toEqual(
			expect.objectContaining({
				id: createResponse.body.id,
				status: 'ARCHIVED',
				variants: [
					expect.objectContaining({
						id: addVariantResponse.body.id,
						sku: 'PREMIER-15KG-NEW',
						status: 'INACTIVE',
					}),
				],
			}),
		)

		const listResponse = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)

		expect(listResponse.statusCode).toBe(200)
		expect(listResponse.body.items).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					id: createResponse.body.id,
					name: 'Racao Premium Caes Adultos 15kg',
					status: 'ARCHIVED',
				}),
			]),
		)
	})

	test('admin can attach, reorder, set primary, and remove product images using uploaded attachments', async () => {
		const { cookie, store } = await authenticateAdmin(app, prisma)
		const frontAttachmentResponse = await uploadAttachment(app, cookie, 'racao-front.png')
		const backAttachmentResponse = await uploadAttachment(app, cookie, 'racao-back.png')
		const frontImageUrl = findUploadedUrl(fakeUploader, 'racao-front.png')
		const backImageUrl = findUploadedUrl(fakeUploader, 'racao-back.png')

		expect(frontAttachmentResponse.statusCode).toBe(201)
		expect(backAttachmentResponse.statusCode).toBe(201)

		const category = await prisma.category.create({
			data: {
				storeId: store.id,
				name: 'Caes',
				slug: 'caes',
			},
		})

		const createProductResponse = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
			.send({
				name: 'Racao Premium',
				slug: 'racao-premium',
				primaryCategoryId: category.id,
				categoryIds: [category.id],
			})

		expect(createProductResponse.statusCode).toBe(201)

		const attachResponse = await request(app.getHttpServer())
			.post(`/api/v1/admin/catalog/products/${createProductResponse.body.id}/images`)
			.set('Cookie', cookie)
			.send({
				images: [
					{
						attachmentId: frontAttachmentResponse.body.attachmentId,
						altText: 'Frontal',
						isPrimary: true,
					},
					{
						attachmentId: backAttachmentResponse.body.attachmentId,
						altText: 'Verso',
					},
				],
			})

		expect(attachResponse.statusCode).toBe(201)
		expect(attachResponse.body.images).toEqual([
			expect.objectContaining({
				attachmentId: frontAttachmentResponse.body.attachmentId,
				url: frontImageUrl,
				altText: 'Frontal',
				position: 0,
				isPrimary: true,
			}),
			expect.objectContaining({
				attachmentId: backAttachmentResponse.body.attachmentId,
				url: backImageUrl,
				altText: 'Verso',
				position: 1,
				isPrimary: false,
			}),
		])

		const reorderResponse = await request(app.getHttpServer())
			.put(`/api/v1/admin/catalog/products/${createProductResponse.body.id}/images/order`)
			.set('Cookie', cookie)
			.send({
				imageIds: [attachResponse.body.images[1].id, attachResponse.body.images[0].id],
				primaryImageId: attachResponse.body.images[1].id,
			})

		expect(reorderResponse.statusCode).toBe(200)
		expect(reorderResponse.body.images).toEqual([
			expect.objectContaining({
				id: attachResponse.body.images[1].id,
				position: 0,
				isPrimary: true,
			}),
			expect.objectContaining({
				id: attachResponse.body.images[0].id,
				position: 1,
				isPrimary: false,
			}),
		])

		const removeResponse = await request(app.getHttpServer())
			.delete(
				`/api/v1/admin/catalog/products/${createProductResponse.body.id}/images/${attachResponse.body.images[1].id}`,
			)
			.set('Cookie', cookie)

		expect(removeResponse.statusCode).toBe(200)
		expect(removeResponse.body.images).toEqual([
			expect.objectContaining({
				id: attachResponse.body.images[0].id,
				position: 0,
				isPrimary: true,
			}),
		])

		const productResponse = await request(app.getHttpServer())
			.get(`/api/v1/admin/catalog/products/${createProductResponse.body.id}`)
			.set('Cookie', cookie)

		expect(productResponse.statusCode).toBe(200)
		expect(productResponse.body.images).toEqual([
			expect.objectContaining({
				id: attachResponse.body.images[0].id,
				attachmentId: frontAttachmentResponse.body.attachmentId,
				url: frontImageUrl,
				position: 0,
				isPrimary: true,
			}),
		])
	})
})
