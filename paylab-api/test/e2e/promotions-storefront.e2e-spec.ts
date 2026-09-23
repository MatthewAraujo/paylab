import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import request from 'supertest'

async function resetDatabase(prisma: PrismaService) {
	await prisma.curatedHomeOffer.deleteMany()
	await prisma.promotion.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.productCategory.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.store.deleteMany()
}

const STORE_SLUG = 'quintal-promo-store'

interface Seed {
	storeId: string
	sacheFrangoVariantId: string
	sacheCarneVariantId: string
	racaoVariantId: string
}

async function seed(prisma: PrismaService): Promise<Seed> {
	const store = await prisma.store.create({ data: { name: 'Quintal Promo', slug: STORE_SLUG } })

	const petFood = await prisma.category.create({
		data: { storeId: store.id, name: 'Alimentacao', slug: 'alimentacao', status: 'ACTIVE' },
	})
	const sache = await prisma.category.create({
		data: {
			storeId: store.id,
			name: 'Sache',
			slug: 'sache',
			status: 'ACTIVE',
			parentCategoryId: petFood.id,
		},
	})

	async function makeProduct(
		slug: string,
		categoryId: string,
		priceCents: number,
	): Promise<string> {
		const product = await prisma.product.create({
			data: {
				storeId: store.id,
				name: slug,
				slug,
				status: 'ACTIVE',
				primaryCategoryId: categoryId,
				categories: { create: { storeId: store.id, categoryId } },
			},
		})
		const variant = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: 'Padrao',
				sku: `${slug}-sku`,
				status: 'ACTIVE',
				priceCents,
			},
		})
		await prisma.inventoryItem.create({
			data: { storeId: store.id, variantId: variant.id, availableQuantity: 100 },
		})
		return variant.id
	}

	const sacheFrangoVariantId = await makeProduct('sache-frango', sache.id, 500)
	const sacheCarneVariantId = await makeProduct('sache-carne', sache.id, 700)
	const racaoVariantId = await makeProduct('racao-premium', petFood.id, 12000)

	// Public automatic BUY_X_PAY_Y on the sache subtree.
	await prisma.promotion.create({
		data: {
			storeId: store.id,
			name: 'Leve 3 pague 2 nos sachês',
			status: 'ACTIVE',
			visibility: 'PUBLIC',
			channels: ['ECOMMERCE'],
			priority: 30,
			isStackable: false,
			targetScope: 'ELIGIBLE_ITEMS',
			conditions: [
				{ type: 'CATEGORY', categoryId: sache.id, includeDescendants: true },
				{ type: 'MIN_ELIGIBLE_QUANTITY', quantity: 3 },
			],
			benefits: [{ type: 'BUY_X_PAY_Y', buyQuantity: 3, payQuantity: 2 }],
			publicHighlight: {
				badge: '3 por R$ 10,00',
				projectedPack: { quantity: 3, priceCents: 1000 },
			},
		},
	})

	// Public free-shipping-over-threshold.
	await prisma.promotion.create({
		data: {
			storeId: store.id,
			name: 'Frete grátis acima de R$ 200',
			status: 'ACTIVE',
			visibility: 'PUBLIC',
			channels: ['ECOMMERCE'],
			priority: 20,
			isStackable: true,
			targetScope: 'SHIPPING',
			conditions: [{ type: 'MIN_CART_VALUE', amountCents: 20000 }],
			benefits: [{ type: 'FREE_SHIPPING' }],
			publicHighlight: { badge: 'Frete grátis acima de R$ 200,00' },
		},
	})

	// Private coupon-only — never in discovery.
	await prisma.promotion.create({
		data: {
			storeId: store.id,
			name: 'Cupom BEMVINDO10',
			status: 'ACTIVE',
			visibility: 'PRIVATE',
			channels: ['ECOMMERCE'],
			priority: 10,
			isStackable: true,
			targetScope: 'ORDER_SUBTOTAL',
			conditions: [{ type: 'COUPON', code: 'BEMVINDO10' }],
			benefits: [{ type: 'PERCENTAGE', percentage: 10 }],
		},
	})

	return { storeId: store.id, sacheFrangoVariantId, sacheCarneVariantId, racaoVariantId }
}

describe('Storefront promotions API (E2E)', () => {
	let app: INestApplication
	let prisma: PrismaService
	let fixture: Seed

	beforeAll(async () => {
		const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
		app = moduleRef.createNestApplication()
		configureApp(app)
		prisma = moduleRef.get(PrismaService)
		await app.init()
		await resetDatabase(prisma)
		fixture = await seed(prisma)
	})

	afterAll(async () => {
		await resetDatabase(prisma)
		await app?.close()
	})

	test('category discovery exposes only public automatic promotions on the branch, capped at two', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/v1/storefront/promotions/discovery')
			.query({ store: STORE_SLUG, surface: 'CATEGORY', categorySlug: 'alimentacao' })

		expect(response.statusCode).toBe(200)
		expect(response.body.surface).toBe('CATEGORY')
		expect(response.body.highlights.length).toBeLessThanOrEqual(2)
		const names = response.body.highlights.map((h: { headline: string }) => h.headline)
		expect(names).not.toContain('Cupom BEMVINDO10')
		// Ordered by priority desc — pack offer first.
		expect(response.body.highlights[0]).toMatchObject({
			benefitType: 'BUY_X_PAY_Y',
			badgeLabel: '3 por R$ 10,00',
			packProjection: {
				packQuantity: 3,
				paidQuantity: 2,
				packTotalCents: 1000,
				impliedUnitPriceCents: 333,
			},
		})
	})

	test('product discovery matches a promotion on an ancestor category', async () => {
		const response = await request(app.getHttpServer())
			.get('/api/v1/storefront/promotions/discovery')
			.query({ store: STORE_SLUG, surface: 'PRODUCT', productSlug: 'sache-frango' })

		expect(response.statusCode).toBe(200)
		const benefitTypes = response.body.highlights.map((h: { benefitType: string }) => h.benefitType)
		expect(benefitTypes).toContain('BUY_X_PAY_Y')
	})

	test('quote applies the pack offer with mixed-line grouping and reports line discounts', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/v1/storefront/promotions/quote')
			.send({
				store: STORE_SLUG,
				channel: 'ECOMMERCE',
				shippingBaseCents: 1990,
				items: [
					{ variantId: fixture.sacheFrangoVariantId, quantity: 2 },
					{ variantId: fixture.sacheCarneVariantId, quantity: 1 },
				],
			})

		expect(response.statusCode).toBe(200)
		expect(response.body).toMatchObject({
			baseSubtotalCents: 1700,
			itemDiscountCents: 500,
			subtotalCents: 1200,
			shippingBaseCents: 1990,
			shippingDiscountCents: 0,
			shippingCents: 1990,
			totalCents: 3190,
		})
		expect(response.body.appliedPromotions).toHaveLength(1)
		expect(response.body.lineDiscounts).toEqual([
			{ variantId: fixture.sacheFrangoVariantId, discountCents: 500 },
		])
	})

	test('quote reduces the resolved shipping base to zero over the cart-value threshold', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/v1/storefront/promotions/quote')
			.send({
				store: STORE_SLUG,
				channel: 'ECOMMERCE',
				shippingBaseCents: 2990,
				items: [{ variantId: fixture.racaoVariantId, quantity: 2 }],
			})

		expect(response.statusCode).toBe(200)
		expect(response.body).toMatchObject({
			baseSubtotalCents: 24000,
			shippingBaseCents: 2990,
			shippingDiscountCents: 2990,
			shippingCents: 0,
			totalCents: 24000,
		})
	})

	test('quote accepts a valid private coupon and rejects an unknown one', async () => {
		const accepted = await request(app.getHttpServer())
			.post('/api/v1/storefront/promotions/quote')
			.send({
				store: STORE_SLUG,
				channel: 'ECOMMERCE',
				couponCode: 'bemvindo10',
				items: [{ variantId: fixture.racaoVariantId, quantity: 1 }],
			})
		expect(accepted.statusCode).toBe(200)
		expect(accepted.body.coupon).toMatchObject({ code: 'BEMVINDO10', accepted: true })
		expect(accepted.body.itemDiscountCents).toBe(1200)

		const rejected = await request(app.getHttpServer())
			.post('/api/v1/storefront/promotions/quote')
			.send({
				store: STORE_SLUG,
				channel: 'ECOMMERCE',
				couponCode: 'NOPE',
				items: [{ variantId: fixture.racaoVariantId, quantity: 1 }],
			})
		expect(rejected.body.coupon).toMatchObject({
			accepted: false,
			rejection: { code: 'NOPE' },
		})
		expect(rejected.body.itemDiscountCents).toBe(0)
	})

	test('a free-shipping incentive nudge is returned below the threshold', async () => {
		const response = await request(app.getHttpServer())
			.post('/api/v1/storefront/promotions/quote')
			.send({
				store: STORE_SLUG,
				channel: 'ECOMMERCE',
				shippingBaseCents: 1990,
				items: [{ variantId: fixture.racaoVariantId, quantity: 1 }],
			})

		expect(response.body.incentives).toEqual([expect.objectContaining({ remainingCents: 8000 })])
	})
})
