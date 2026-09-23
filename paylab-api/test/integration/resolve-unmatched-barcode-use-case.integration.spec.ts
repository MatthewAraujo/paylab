import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { CreateWalkInOrderUseCase } from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { BarcodeNotInDraftError } from '@/domain/quintalpet/application/use-cases/errors/barcode-not-in-draft-error'
import { VariantBarcodeAlreadySetError } from '@/domain/quintalpet/application/use-cases/errors/variant-barcode-already-set-error'
import { VariantNotFoundError } from '@/domain/quintalpet/application/use-cases/errors/variant-not-found-error'
import { FinalizeSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/finalize-sale-draft'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { ResolveUnmatchedBarcodeUseCase } from '@/domain/quintalpet/application/use-cases/resolve-unmatched-barcode'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCatalogCategoriesRepository } from '@/infra/database/prisma/repositories/catalog/prisma-catalog-categories-repository'
import { PrismaStoreCustomersRepository } from '@/infra/database/prisma/repositories/customers/prisma-store-customers-repository'
import { PrismaInventoryItemsRepository } from '@/infra/database/prisma/repositories/inventory/prisma-inventory-items-repository'
import { PrismaOrdersRepository } from '@/infra/database/prisma/repositories/orders/prisma-orders-repository'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'
import { PrismaStoresRepository } from '@/infra/database/prisma/repositories/prisma-stores-repository'
import { PrismaPromotionsRepository } from '@/infra/database/prisma/repositories/promotions/prisma-promotions-repository'
import { NotFoundException } from '@nestjs/common'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const storesRepository: StoresRepository = new PrismaStoresRepository(prisma)
const ordersRepository: OrdersRepository = new PrismaOrdersRepository(prisma)
const storeCustomersRepository: StoreCustomersRepository = new PrismaStoreCustomersRepository(
	prisma,
)
const inventoryItemsRepository: InventoryItemsRepository = new PrismaInventoryItemsRepository(
	prisma,
)
const quotePromotionsUseCase = new QuotePromotionsUseCase(
	prisma,
	new PrismaPromotionsRepository(prisma),
	new PrismaCatalogCategoriesRepository(prisma),
)
const createWalkInOrderUseCase = new CreateWalkInOrderUseCase(
	prisma,
	ordersRepository,
	storeCustomersRepository,
	inventoryItemsRepository,
	quotePromotionsUseCase,
)
const finalizeSaleDraftUseCase = new FinalizeSaleDraftUseCase(
	prisma,
	saleDraftsRepository,
	storesRepository,
	createWalkInOrderUseCase,
)
const resolveUnmatchedBarcodeUseCase = new ResolveUnmatchedBarcodeUseCase(
	prisma,
	saleDraftsRepository,
)

async function resetDatabase() {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.store.deleteMany()
}

async function seedStoreWithVariant(
	store: { id: string },
	suffix: string,
	options: { barcode?: string | null } = {},
) {
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
	return prisma.productVariant.create({
		data: {
			storeId: store.id,
			productId: product.id,
			name: '15kg',
			sku: `SKU-${suffix}`,
			priceCents: 5000,
			status: 'ACTIVE',
			barcode: options.barcode ?? null,
		},
	})
}

async function seedStore(suffix: string) {
	return prisma.store.create({ data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` } })
}

async function stockVariant(storeId: string, variantId: string, quantity: number) {
	const item = InventoryItem.create({
		storeId: new UniqueEntityID(storeId),
		variantId: new UniqueEntityID(variantId),
	})
	await inventoryItemsRepository.save(item, item.receive(quantity, 'seed stock'))
}

/**
 * Builds a COMPLETED SaleDraft that carries an unmatched barcode and a real
 * finalized Order — the realistic post-checkout shape T8 resolves against.
 */
async function seedCompletedDraftWithUnmatchedBarcode(suffix: string, barcode: string) {
	const store = await seedStore(suffix)
	const soldVariant = await seedStoreWithVariant(store, `${suffix}-sold`)
	await stockVariant(store.id, soldVariant.id, 10)

	const session = PdvSession.create({
		storeId: new UniqueEntityID(store.id),
		openedByUserId: 'user-1',
	})
	await pdvSessionsRepository.save(session)
	const draft = SaleDraft.create({ pdvSessionId: session.id })
	draft.addItem(new UniqueEntityID(soldVariant.id), 1)
	draft.addUnmatchedBarcode(barcode)
	await saleDraftsRepository.save(draft)

	const order = await finalizeSaleDraftUseCase.execute({
		pdvSessionId: session.id.toString(),
		guestName: 'Cliente Balcao',
		guestPhone: '11999998888',
		paymentMethod: OrderPaymentMethod.CASH,
	})

	return { store, order, draft }
}

describe('ResolveUnmatchedBarcodeUseCase', () => {
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

	test('resolving a barcode against a matching variantId sets ProductVariant.barcode and removes the entry from the draft, without touching the finalized Order', async () => {
		const { store, order, draft } = await seedCompletedDraftWithUnmatchedBarcode(
			'resolve-happy',
			'unknown-barcode-1',
		)
		const targetVariant = await seedStoreWithVariant(store, 'resolve-happy-target')

		const orderBefore = await prisma.order.findUniqueOrThrow({
			where: { id: order.id.toString() },
			include: { items: true },
		})

		await resolveUnmatchedBarcodeUseCase.execute({
			saleDraftId: draft.id.toString(),
			barcode: 'unknown-barcode-1',
			variantId: targetVariant.id,
		})

		const updatedVariant = await prisma.productVariant.findUniqueOrThrow({
			where: { id: targetVariant.id },
		})
		expect(updatedVariant.barcode).toBe('unknown-barcode-1')

		const updatedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id.toString() },
		})
		expect(updatedDraft.unmatchedBarcodes).toEqual([])

		const orderAfter = await prisma.order.findUniqueOrThrow({
			where: { id: order.id.toString() },
			include: { items: true },
		})
		expect(orderAfter).toEqual(orderBefore)
	})

	test('resolving against a variantId that already has a different barcode throws and does not overwrite it', async () => {
		const { store, draft } = await seedCompletedDraftWithUnmatchedBarcode(
			'resolve-already-set',
			'unknown-barcode-2',
		)
		const targetVariant = await seedStoreWithVariant(store, 'resolve-already-set-target', {
			barcode: 'existing-barcode',
		})

		await expect(
			resolveUnmatchedBarcodeUseCase.execute({
				saleDraftId: draft.id.toString(),
				barcode: 'unknown-barcode-2',
				variantId: targetVariant.id,
			}),
		).rejects.toThrow(VariantBarcodeAlreadySetError)

		const untouchedVariant = await prisma.productVariant.findUniqueOrThrow({
			where: { id: targetVariant.id },
		})
		expect(untouchedVariant.barcode).toBe('existing-barcode')

		const untouchedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id.toString() },
		})
		expect(untouchedDraft.unmatchedBarcodes).toEqual(['unknown-barcode-2'])
	})

	test('resolving against a variantId whose store does not match the draft store throws (cross-store guard)', async () => {
		const { draft } = await seedCompletedDraftWithUnmatchedBarcode(
			'resolve-cross-store',
			'unknown-barcode-3',
		)
		const otherStore = await seedStore('resolve-cross-store-other')
		const otherStoreVariant = await seedStoreWithVariant(otherStore, 'resolve-cross-store-target')

		await expect(
			resolveUnmatchedBarcodeUseCase.execute({
				saleDraftId: draft.id.toString(),
				barcode: 'unknown-barcode-3',
				variantId: otherStoreVariant.id,
			}),
		).rejects.toThrow(VariantNotFoundError)

		const untouchedVariant = await prisma.productVariant.findUniqueOrThrow({
			where: { id: otherStoreVariant.id },
		})
		expect(untouchedVariant.barcode).toBeNull()
	})

	test('resolving a barcode string not present in the draft unmatchedBarcodes throws', async () => {
		const { store, draft } = await seedCompletedDraftWithUnmatchedBarcode(
			'resolve-not-present',
			'unknown-barcode-4',
		)
		const targetVariant = await seedStoreWithVariant(store, 'resolve-not-present-target')

		await expect(
			resolveUnmatchedBarcodeUseCase.execute({
				saleDraftId: draft.id.toString(),
				barcode: 'a-barcode-never-scanned',
				variantId: targetVariant.id,
			}),
		).rejects.toThrow(BarcodeNotInDraftError)
	})

	test('resolving against an unknown saleDraftId throws', async () => {
		await expect(
			resolveUnmatchedBarcodeUseCase.execute({
				saleDraftId: '00000000-0000-0000-0000-000000000000',
				barcode: 'any-barcode',
				variantId: '00000000-0000-0000-0000-000000000000',
			}),
		).rejects.toThrow(NotFoundException)
	})
})
