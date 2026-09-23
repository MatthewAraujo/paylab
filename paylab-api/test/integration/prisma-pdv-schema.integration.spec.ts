import { PrismaService } from '@/infra/database/prisma/prisma.service'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()

async function resetDatabase() {
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.storeMember.deleteMany()
	await prisma.store.deleteMany()
}

async function seedStoreWithVariant(suffix: string) {
	const store = await prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` },
	})
	const brand = await prisma.brand.create({
		data: { storeId: store.id, name: 'Marca', slug: `marca-${suffix}` },
	})
	const category = await prisma.category.create({
		data: { storeId: store.id, name: 'Categoria', slug: `categoria-${suffix}` },
	})
	const product = await prisma.product.create({
		data: {
			storeId: store.id,
			name: 'Racao Premium',
			slug: `produto-${suffix}`,
			brandId: brand.id,
			primaryCategoryId: category.id,
		},
	})
	const variant = await prisma.productVariant.create({
		data: {
			storeId: store.id,
			productId: product.id,
			name: '15kg',
			sku: `SKU-${suffix}`,
			priceCents: 5000,
			status: 'ACTIVE',
		},
	})
	return { store, product, variant }
}

describe('Prisma PDV schema invariants', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('creates a PdvSession, a SaleDraft under it, and a SaleDraftItem referencing a ProductVariant', async () => {
		const { store, variant } = await seedStoreWithVariant('pdv-happy')

		const session = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1', status: 'OPEN' },
		})
		expect(session.status).toBe('OPEN')
		expect(session.closedAt).toBeNull()

		const draft = await prisma.saleDraft.create({
			data: { pdvSessionId: session.id, status: 'OPEN' },
		})
		expect(draft.status).toBe('OPEN')
		expect(draft.unmatchedBarcodes).toEqual([])

		const item = await prisma.saleDraftItem.create({
			data: { saleDraftId: draft.id, variantId: variant.id, quantity: 2 },
		})
		expect(item.quantity).toBe(2)

		const hydratedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id },
			include: { items: true },
		})
		expect(hydratedDraft.items).toHaveLength(1)
		expect(hydratedDraft.items[0].variantId).toBe(variant.id)
	})

	test('enforces at most one OPEN PdvSession per store at the DB level', async () => {
		const { store } = await seedStoreWithVariant('pdv-single-session')

		await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1', status: 'OPEN' },
		})

		await expect(
			prisma.pdvSession.create({
				data: { storeId: store.id, openedByUserId: 'user-2', status: 'OPEN' },
			}),
		).rejects.toThrow()

		// A CLOSED session for the same store is not restricted by the partial index.
		await expect(
			prisma.pdvSession.create({
				data: { storeId: store.id, openedByUserId: 'user-3', status: 'CLOSED' },
			}),
		).resolves.toMatchObject({ status: 'CLOSED' })
	})

	test('enforces at most one OPEN SaleDraft per PdvSession at the DB level', async () => {
		const { store } = await seedStoreWithVariant('pdv-single-draft')
		const session = await prisma.pdvSession.create({
			data: { storeId: store.id, openedByUserId: 'user-1', status: 'OPEN' },
		})

		await prisma.saleDraft.create({ data: { pdvSessionId: session.id, status: 'OPEN' } })

		await expect(
			prisma.saleDraft.create({ data: { pdvSessionId: session.id, status: 'OPEN' } }),
		).rejects.toThrow()

		await expect(
			prisma.saleDraft.create({ data: { pdvSessionId: session.id, status: 'COMPLETED' } }),
		).resolves.toMatchObject({ status: 'COMPLETED' })
	})

	test('ProductVariant.barcode is unique per store, allows many NULLs, and is distinct from sku', async () => {
		const { store, product } = await seedStoreWithVariant('pdv-barcode')
		const otherStore = await prisma.store.create({
			data: { name: 'Outra Loja', slug: 'outra-loja-pdv-barcode' },
		})

		const variantA = await prisma.productVariant.create({
			data: {
				storeId: store.id,
				productId: product.id,
				name: '1kg',
				sku: 'SKU-barcode-a',
				priceCents: 1000,
				barcode: '7891234567890',
			},
		})
		expect(variantA.barcode).toBe('7891234567890')

		// Many NULL barcodes are allowed within the same store.
		await expect(
			prisma.productVariant.create({
				data: {
					storeId: store.id,
					productId: product.id,
					name: '2kg',
					sku: 'SKU-barcode-b',
					priceCents: 2000,
				},
			}),
		).resolves.toMatchObject({ barcode: null })
		await expect(
			prisma.productVariant.create({
				data: {
					storeId: store.id,
					productId: product.id,
					name: '3kg',
					sku: 'SKU-barcode-c',
					priceCents: 3000,
				},
			}),
		).resolves.toMatchObject({ barcode: null })

		// Duplicate barcode within the same store is rejected.
		await expect(
			prisma.productVariant.create({
				data: {
					storeId: store.id,
					productId: product.id,
					name: '4kg',
					sku: 'SKU-barcode-d',
					priceCents: 4000,
					barcode: '7891234567890',
				},
			}),
		).rejects.toMatchObject({ code: 'P2002' })

		// Same barcode value is fine in a different store.
		const otherProduct = await prisma.product.create({
			data: { storeId: otherStore.id, name: 'Produto Outro', slug: 'produto-outro-pdv-barcode' },
		})
		await expect(
			prisma.productVariant.create({
				data: {
					storeId: otherStore.id,
					productId: otherProduct.id,
					name: '1kg',
					sku: 'SKU-barcode-other',
					priceCents: 1000,
					barcode: '7891234567890',
				},
			}),
		).resolves.toMatchObject({ barcode: '7891234567890' })
	})

	test('Order accepts CASH as a paymentMethod', async () => {
		const { store, product } = await seedStoreWithVariant('pdv-cash')
		const variant = await prisma.productVariant.findFirstOrThrow({
			where: { productId: product.id },
		})

		const order = await prisma.order.create({
			data: {
				storeId: store.id,
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				orderCode: 'QUIN-PDVCASH1',
				subtotalCents: 5000,
				baseSubtotalCents: 5000,
				itemDiscountTotalCents: 0,
				shippingCents: 0,
				shippingBaseCents: 0,
				shippingDiscountCents: 0,
				totalDiscountCents: 0,
				totalCents: 5000,
				appliedPromotions: [],
				shippingAddress: {},
				deliveryLabel: 'Retirada no local',
				paymentMethod: 'CASH',
				items: {
					create: [
						{
							productId: product.id,
							variantId: variant.id,
							productName: 'Racao Premium',
							variantLabel: '15kg',
							sku: variant.sku,
							unitPriceCents: 5000,
							baseUnitPriceCents: 5000,
							unitDiscountCents: 0,
							quantity: 1,
							lineTotalCents: 5000,
							baseLineTotalCents: 5000,
							lineDiscountCents: 0,
						},
					],
				},
			},
		})

		expect(order.paymentMethod).toBe('CASH')
	})
})
