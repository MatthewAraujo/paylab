import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Uploader } from '@/shared/storage/uploader'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'
import { FakeUploader } from '../storage/fake-uploader'
import { authenticateStoreMember, resetBetterAuthTables } from './support/better-auth'

// The canonical template header (what the download endpoint serves today).
const TEMPLATE_HEADER =
	'product_slug,product_name,description,brand,primary_category,subcategory,variant_name,sku,price,cost,barcode,weight,initial_stock'

// The fixtures below still carry a legacy `compare_at_price` column: it was
// removed from the schema (markdown is a Promotion now, not a variant field) and
// the importer must tolerate the unknown column instead of rejecting the file.
const HEADER =
	'product_slug,product_name,description,brand,primary_category,subcategory,variant_name,sku,price,compare_at_price,cost,barcode,weight,initial_stock'

function csv(lines: string[]): string {
	return `${[HEADER, ...lines].join('\n')}\n`
}

async function createCategory(
	prisma: PrismaService,
	input: {
		storeId: string
		name: string
		slug: string
		parentCategoryId?: string | null
		status?: 'ACTIVE' | 'INACTIVE' | 'ARCHIVED'
	},
) {
	return prisma.category.create({
		data: {
			storeId: input.storeId,
			name: input.name,
			slug: input.slug,
			parentCategoryId: input.parentCategoryId ?? null,
			status: input.status ?? 'ACTIVE',
		},
	})
}

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

describe('Catalog CSV import API (E2E)', () => {
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
			storeName: 'Quintal Import',
			storeSlug: 'quintal-import',
		})
	}

	function uploadCsv(cookie: string, body: string) {
		return request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/import')
			.set('Cookie', cookie)
			.attach('file', Buffer.from(body, 'utf-8'), {
				filename: 'import.csv',
				contentType: 'text/csv',
			})
	}

	test('imports a multipart CSV and returns the created counts; products land as DRAFT', async () => {
		const { cookie } = await authenticate()

		const response = await uploadCsv(
			cookie,
			csv([
				'racao-premium,Racao Premium,,Golden,Caes,Racoes,10kg,,199.90,,,,10kg,25',
				'racao-premium,Racao Premium,,,,,15kg,,289.90,,,,15kg,0',
				'petisco,Petisco Natural,,,Caes,,Unico,,49.90,,,,,5',
			]),
		)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			imported: {
				products: 2,
				variants: 3,
				brandsCreated: 1,
				categoriesCreated: 2,
				inventoryMovements: 2,
			},
		})

		const list = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)

		expect(list.statusCode).toBe(200)
		expect(list.body.items).toHaveLength(2)
		expect(list.body.items.every((item: { status: string }) => item.status === 'DRAFT')).toBe(true)
	})

	test('rejects a file with a bad row with 422 and persists nothing', async () => {
		const { cookie } = await authenticate()

		const response = await uploadCsv(
			cookie,
			csv([
				'ok-product,Ok Product,,,,,10kg,,49.90,,,,,0',
				'bad-product,Bad Product,,,,,15kg,,not-a-number,,,,,0',
			]),
		)

		expect(response.statusCode).toBe(422)
		expect(response.body.error).toBe('import_validation_failed')
		expect(response.body.rowErrors).toEqual(
			expect.arrayContaining([expect.objectContaining({ line: 3, column: 'price' })]),
		)

		const list = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)

		expect(list.body.items).toHaveLength(0)
	})

	test('a second upload of the same file is rejected because the slugs now exist', async () => {
		const { cookie } = await authenticate()
		const file = csv(['racao,Racao,,,,,10kg,,49.90,,,,,0'])

		expect((await uploadCsv(cookie, file)).statusCode).toBe(200)

		const second = await uploadCsv(cookie, file)
		expect(second.statusCode).toBe(422)
		expect(second.body.rowErrors).toEqual(
			expect.arrayContaining([expect.objectContaining({ code: 'PRODUCT_SLUG_EXISTS' })]),
		)
	})

	test('a file larger than 2 MB is refused before import and persists nothing', async () => {
		const { cookie } = await authenticate()

		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/import')
			.set('Cookie', cookie)
			.attach('file', Buffer.alloc(2 * 1024 * 1024 + 512, 0x61), {
				filename: 'big.csv',
				contentType: 'text/csv',
			})

		expect(response.statusCode).toBeGreaterThanOrEqual(400)

		const list = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/products')
			.set('Cookie', cookie)
		expect(list.body.items).toHaveLength(0)
	})

	test('requires a store-member session', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/v1/admin/catalog/products/import')
			.attach('file', Buffer.from(csv(['a,A,,,,,x,,10.00,,,,,0']), 'utf-8'), {
				filename: 'import.csv',
				contentType: 'text/csv',
			})

		expect([401, 403]).toContain(response.statusCode)
	})

	test('imports a simple subcategory reference through the existing /import endpoint', async () => {
		const { cookie, store } = await authenticate()
		const gatos = await createCategory(prisma, {
			storeId: store.id,
			name: 'Gatos',
			slug: 'gatos',
		})
		// a same-named "Racao" subcategory under Gatos and another under Caes:
		// the bare "Higiene" reference must still resolve/create under the row's
		// primary_category (Gatos), not get confused by the duplicate names.
		await createCategory(prisma, {
			storeId: store.id,
			name: 'Racao',
			slug: 'gatos-racao',
			parentCategoryId: gatos.id,
		})
		const caes = await createCategory(prisma, {
			storeId: store.id,
			name: 'Caes',
			slug: 'caes',
		})
		await createCategory(prisma, {
			storeId: store.id,
			name: 'Racao',
			slug: 'caes-racao',
			parentCategoryId: caes.id,
		})

		const response = await uploadCsv(
			cookie,
			csv(['racao-gatos,Racao Gatos,,Golden,Gatos,Higiene,10kg,,199.90,,,,10kg,25']),
		)

		expect(response.statusCode).toBe(200)
		expect(response.body).toEqual({
			imported: {
				products: 1,
				variants: 1,
				brandsCreated: 1,
				categoriesCreated: 1,
				inventoryMovements: 1,
			},
		})

		const product = await prisma.product.findUniqueOrThrow({
			where: { storeId_slug: { slug: 'racao-gatos', storeId: store.id } },
		})
		const createdCategory = await prisma.category.findFirstOrThrow({
			where: {
				storeId: store.id,
				name: 'Higiene',
				parentCategoryId: gatos.id,
			},
		})

		const detail = await request(app.getHttpServer())
			.get(`/api/v1/admin/catalog/products/${product.id}`)
			.set('Cookie', cookie)

		expect(detail.statusCode).toBe(200)
		expect(detail.body).toEqual(
			expect.objectContaining({
				id: product.id,
				primaryCategoryId: gatos.id,
				categoryIds: expect.arrayContaining([gatos.id, createdCategory.id]),
			}),
		)

		expect(createdCategory.parentCategoryId).toBe(gatos.id)
	})

	test('returns AMBIGUOUS_CATEGORY when a bare category name exists in multiple branches', async () => {
		const { cookie, store } = await authenticate()
		await createCategory(prisma, {
			storeId: store.id,
			name: 'Petiscos',
			slug: 'petiscos',
		})
		const gatos = await createCategory(prisma, {
			storeId: store.id,
			name: 'Gatos',
			slug: 'gatos',
		})
		const caes = await createCategory(prisma, {
			storeId: store.id,
			name: 'Caes',
			slug: 'caes',
		})
		await createCategory(prisma, {
			storeId: store.id,
			name: 'Racao',
			slug: 'gatos-racao',
			parentCategoryId: gatos.id,
		})
		await createCategory(prisma, {
			storeId: store.id,
			name: 'Racao',
			slug: 'caes-racao',
			parentCategoryId: caes.id,
		})

		const response = await uploadCsv(
			cookie,
			csv(['racao-ambigua,Racao Ambigua,,Golden,Petiscos,Racao,10kg,,199.90,,,,10kg,25']),
		)

		expect(response.statusCode).toBe(422)
		expect(response.body.error).toBe('import_validation_failed')
		expect(response.body.rowErrors).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					line: 2,
					column: 'categories',
					code: 'AMBIGUOUS_CATEGORY',
				}),
			]),
		)

		const products = await prisma.product.findMany({ where: { storeId: store.id } })
		expect(products).toHaveLength(0)
	})

	test('serves a CSV template whose example row round-trips through the import', async () => {
		const { cookie } = await authenticate()

		const template = await request(app.getHttpServer())
			.get('/api/v1/admin/catalog/products/import/template')
			.set('Cookie', cookie)

		expect(template.statusCode).toBe(200)
		expect(template.headers['content-type']).toContain('text/csv')
		expect(template.headers['content-disposition']).toContain('attachment')
		expect(template.headers['content-disposition']).toContain('modelo-importacao-produtos.csv')

		const lines = template.text.trim().split('\n')
		expect(lines[0]).toContain('slug do produto')
		expect(lines[1]).toBe(TEMPLATE_HEADER)
		expect(lines).toHaveLength(3)
		expect(lines[2]).toContain('Rações')

		const roundTrip = await uploadCsv(cookie, template.text)
		expect(roundTrip.statusCode).toBe(200)
		expect(roundTrip.body.imported.products).toBe(1)
	})
})
