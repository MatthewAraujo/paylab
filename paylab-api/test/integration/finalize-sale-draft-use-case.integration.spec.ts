import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItemsRepository } from '@/domain/quintalpet/application/repositories/inventory-items-repository'
import { OrdersRepository } from '@/domain/quintalpet/application/repositories/orders-repository'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { StoreCustomersRepository } from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { CreateWalkInOrderUseCase } from '@/domain/quintalpet/application/use-cases/create-walk-in-order'
import { EmptySaleDraftError } from '@/domain/quintalpet/application/use-cases/errors/empty-sale-draft-error'
import { OrderItemUnavailableError } from '@/domain/quintalpet/application/use-cases/errors/order-item-unavailable-error'
import { FinalizeSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/finalize-sale-draft'
import { QuotePromotionsUseCase } from '@/domain/quintalpet/application/use-cases/quote-promotions'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { OrderPaymentMethod } from '@/domain/quintalpet/enterprise/types/order-payment-method'
import { OrderStatus } from '@/domain/quintalpet/enterprise/types/order-status'
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

async function resetDatabase() {
	await prisma.orderItem.deleteMany()
	await prisma.order.deleteMany()
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.inventoryMovement.deleteMany()
	await prisma.inventoryItem.deleteMany()
	await prisma.storeCustomerAddress.deleteMany()
	await prisma.storeCustomer.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
	await prisma.store.deleteMany()
}

async function seedOpenSessionAndDraft(suffix: string) {
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

	const session = PdvSession.create({
		storeId: new UniqueEntityID(store.id),
		openedByUserId: 'user-1',
	})
	await pdvSessionsRepository.save(session)
	const draft = SaleDraft.create({ pdvSessionId: session.id })
	await saleDraftsRepository.save(draft)

	return { store, product, variant, session, draft }
}

async function stockVariant(storeId: string, variantId: string, quantity: number) {
	const item = InventoryItem.create({
		storeId: new UniqueEntityID(storeId),
		variantId: new UniqueEntityID(variantId),
	})
	await inventoryItemsRepository.save(item, item.receive(quantity, 'seed stock'))
}

async function seedCustomer(storeId: string, suffix: string) {
	const storeCustomer = StoreCustomer.create({
		storeId: new UniqueEntityID(storeId),
		customerProfileId: `customer-profile-${suffix}`,
		email: `cliente-${suffix}@example.com`,
		name: 'Cliente Balcao',
	})
	await storeCustomersRepository.save(storeCustomer)
	return storeCustomer
}

describe('FinalizeSaleDraftUseCase', () => {
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

	test('finalizing with items and a registered storeCustomerId creates a DELIVERED order, decrements inventory, completes the draft, and opens a fresh empty draft', async () => {
		const { store, variant, session, draft } = await seedOpenSessionAndDraft('finalize-happy')
		await stockVariant(store.id, variant.id, 10)
		const storeCustomer = await seedCustomer(store.id, 'finalize-happy')
		draft.addItem(new UniqueEntityID(variant.id), 3)
		await saleDraftsRepository.save(draft)

		const order = await finalizeSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			storeCustomerId: storeCustomer.id.toString(),
			paymentMethod: OrderPaymentMethod.CASH,
		})

		expect(order.status).toBe(OrderStatus.DELIVERED)
		expect(order.totalCents).toBe(15000)
		expect(order.items).toHaveLength(1)

		const inventoryItem = await inventoryItemsRepository.findByVariantId(variant.id, store.id)
		expect(inventoryItem?.availableQuantity).toBe(7)

		const completedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id.toString() },
		})
		expect(completedDraft.status).toBe('COMPLETED')

		const newDraft = await saleDraftsRepository.findOpenByPdvSessionId(session.id.toString())
		expect(newDraft).not.toBeNull()
		expect(newDraft?.id.toString()).not.toBe(draft.id.toString())
		expect(newDraft?.isEmpty).toBe(true)
		expect(newDraft?.isOpen).toBe(true)
	})

	test('finalizing with a guest name/phone instead of a registered customer works the same way', async () => {
		const { store, variant, session, draft } = await seedOpenSessionAndDraft('finalize-guest')
		await stockVariant(store.id, variant.id, 10)
		draft.addItem(new UniqueEntityID(variant.id), 2)
		await saleDraftsRepository.save(draft)

		const order = await finalizeSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			guestName: 'Cliente Balcao',
			guestPhone: '11999998888',
			paymentMethod: OrderPaymentMethod.CASH,
		})

		expect(order.storeCustomerId).toBeNull()
		expect(order.guestName).toBe('Cliente Balcao')
		expect(order.guestPhone).toBe('11999998888')
	})

	test.each([OrderPaymentMethod.PIX, OrderPaymentMethod.CREDIT_CARD])(
		'finalizing with paymentMethod %s still works (no regression on existing values)',
		async (paymentMethod) => {
			const { store, variant, session, draft } = await seedOpenSessionAndDraft(
				`finalize-pm-${paymentMethod}`,
			)
			await stockVariant(store.id, variant.id, 10)
			draft.addItem(new UniqueEntityID(variant.id), 1)
			await saleDraftsRepository.save(draft)

			const order = await finalizeSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod,
			})

			expect(order.paymentMethod).toBe(paymentMethod)
		},
	)

	test('finalizing when an item has insufficient stock throws OrderItemUnavailableError and leaves the draft OPEN, untouched', async () => {
		const { store, variant, session, draft } = await seedOpenSessionAndDraft('finalize-short-stock')
		await stockVariant(store.id, variant.id, 1)
		draft.addItem(new UniqueEntityID(variant.id), 5)
		await saleDraftsRepository.save(draft)

		await expect(
			finalizeSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod: OrderPaymentMethod.CASH,
			}),
		).rejects.toThrow(OrderItemUnavailableError)

		expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0)

		const stillOpenDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id.toString() },
			include: { items: true },
		})
		expect(stillOpenDraft.status).toBe('OPEN')
		expect(stillOpenDraft.items).toHaveLength(1)
		expect(stillOpenDraft.items[0].quantity).toBe(5)

		// No second draft should have been created — the operator adjusts and retries this one.
		expect(await prisma.saleDraft.count({ where: { pdvSessionId: session.id.toString() } })).toBe(1)
	})

	test('finalizing an empty draft throws EmptySaleDraftError', async () => {
		const { session } = await seedOpenSessionAndDraft('finalize-empty')

		await expect(
			finalizeSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod: OrderPaymentMethod.CASH,
			}),
		).rejects.toThrow(EmptySaleDraftError)
	})

	test('finalizing a draft that is not OPEN (already cancelled) throws', async () => {
		const { session, draft, variant } = await seedOpenSessionAndDraft('finalize-not-open')
		draft.addItem(new UniqueEntityID(variant.id), 1)
		draft.cancel()
		await saleDraftsRepository.save(draft)

		await expect(
			finalizeSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				guestName: 'Cliente Balcao',
				guestPhone: '11999998888',
				paymentMethod: OrderPaymentMethod.CASH,
			}),
		).rejects.toThrow(NotFoundException)
	})
})
