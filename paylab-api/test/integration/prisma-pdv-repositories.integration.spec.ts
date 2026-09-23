import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PdvSessionStatus } from '@/domain/quintalpet/enterprise/types/pdv-session-status'
import { SaleDraftStatus } from '@/domain/quintalpet/enterprise/types/sale-draft-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository = new PrismaSaleDraftsRepository(prisma)

async function resetDatabase() {
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.productVariant.deleteMany()
	await prisma.product.deleteMany()
	await prisma.category.deleteMany()
	await prisma.brand.deleteMany()
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
	return { store, variant }
}

describe('Prisma PDV repositories', () => {
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

	describe('PrismaPdvSessionsRepository', () => {
		test('findOpenByStoreId returns the currently OPEN session for a store, or null', async () => {
			const { store } = await seedStoreWithVariant('sessions-find-open')

			expect(await pdvSessionsRepository.findOpenByStoreId(store.id)).toBeNull()

			const session = PdvSession.create({
				storeId: new UniqueEntityID(store.id),
				openedByUserId: 'user-1',
			})
			await pdvSessionsRepository.save(session)

			const found = await pdvSessionsRepository.findOpenByStoreId(store.id)
			expect(found).not.toBeNull()
			expect(found?.id.toString()).toBe(session.id.toString())
			expect(found?.status).toBe(PdvSessionStatus.OPEN)

			session.close(false)
			await pdvSessionsRepository.save(session)

			expect(await pdvSessionsRepository.findOpenByStoreId(store.id)).toBeNull()
		})

		test('save persists a new session and status transitions', async () => {
			const { store } = await seedStoreWithVariant('sessions-save')

			const session = PdvSession.create({
				storeId: new UniqueEntityID(store.id),
				openedByUserId: 'user-1',
			})
			await pdvSessionsRepository.save(session)

			const persisted = await prisma.pdvSession.findUniqueOrThrow({
				where: { id: session.id.toString() },
			})
			expect(persisted.status).toBe('OPEN')
			expect(persisted.closedAt).toBeNull()

			session.close(false)
			await pdvSessionsRepository.save(session)

			const persistedAfterClose = await prisma.pdvSession.findUniqueOrThrow({
				where: { id: session.id.toString() },
			})
			expect(persistedAfterClose.status).toBe('CLOSED')
			expect(persistedAfterClose.closedAt).not.toBeNull()
		})

		test('findById is scoped to the given storeId', async () => {
			const { store: storeA } = await seedStoreWithVariant('sessions-scope-a')
			const { store: storeB } = await seedStoreWithVariant('sessions-scope-b')

			const session = PdvSession.create({
				storeId: new UniqueEntityID(storeA.id),
				openedByUserId: 'user-1',
			})
			await pdvSessionsRepository.save(session)

			expect(
				(await pdvSessionsRepository.findById(session.id.toString(), storeA.id))?.id.toString(),
			).toBe(session.id.toString())
			expect(await pdvSessionsRepository.findById(session.id.toString(), storeB.id)).toBeNull()
		})
	})

	describe('PrismaSaleDraftsRepository', () => {
		test('findOpenByPdvSessionId returns the currently OPEN draft with items and unmatchedBarcodes, or null', async () => {
			const { store, variant } = await seedStoreWithVariant('drafts-find-open')
			const session = PdvSession.create({
				storeId: new UniqueEntityID(store.id),
				openedByUserId: 'user-1',
			})
			await pdvSessionsRepository.save(session)

			expect(await saleDraftsRepository.findOpenByPdvSessionId(session.id.toString())).toBeNull()

			const draft = SaleDraft.create({ pdvSessionId: session.id })
			draft.addItem(new UniqueEntityID(variant.id), 2)
			draft.addUnmatchedBarcode('7891234567890')
			await saleDraftsRepository.save(draft)

			const found = await saleDraftsRepository.findOpenByPdvSessionId(session.id.toString())
			expect(found).not.toBeNull()
			expect(found?.status).toBe(SaleDraftStatus.OPEN)
			expect(found?.items).toHaveLength(1)
			expect(found?.items[0].variantId.toString()).toBe(variant.id)
			expect(found?.items[0].quantity).toBe(2)
			expect(found?.unmatchedBarcodes).toEqual(['7891234567890'])
		})

		test('save persists item add/remove/cancel changes and the unmatchedBarcodes array', async () => {
			const { store, variant } = await seedStoreWithVariant('drafts-save')
			const otherVariant = await prisma.productVariant.create({
				data: {
					storeId: store.id,
					productId: (await prisma.product.findFirstOrThrow({ where: { storeId: store.id } })).id,
					name: '30kg',
					sku: 'SKU-drafts-save-2',
					priceCents: 9000,
					status: 'ACTIVE',
				},
			})
			const session = PdvSession.create({
				storeId: new UniqueEntityID(store.id),
				openedByUserId: 'user-1',
			})
			await pdvSessionsRepository.save(session)

			const draft = SaleDraft.create({ pdvSessionId: session.id })
			draft.addItem(new UniqueEntityID(variant.id), 1)
			draft.addItem(new UniqueEntityID(otherVariant.id), 3)
			await saleDraftsRepository.save(draft)

			let persistedItems = await prisma.saleDraftItem.findMany({
				where: { saleDraftId: draft.id.toString() },
			})
			expect(persistedItems).toHaveLength(2)

			// Increment an existing line and remove the other.
			draft.addItem(new UniqueEntityID(variant.id), 4)
			draft.removeItem(new UniqueEntityID(otherVariant.id))
			await saleDraftsRepository.save(draft)

			persistedItems = await prisma.saleDraftItem.findMany({
				where: { saleDraftId: draft.id.toString() },
			})
			expect(persistedItems).toHaveLength(1)
			expect(persistedItems[0].variantId).toBe(variant.id)
			expect(persistedItems[0].quantity).toBe(5)

			draft.addUnmatchedBarcode('0000000000000')
			await saleDraftsRepository.save(draft)
			let persistedDraft = await prisma.saleDraft.findUniqueOrThrow({
				where: { id: draft.id.toString() },
			})
			expect(persistedDraft.unmatchedBarcodes).toEqual(['0000000000000'])

			// cancel() empties items and marks the draft CANCELLED.
			draft.cancel()
			await saleDraftsRepository.save(draft)

			persistedItems = await prisma.saleDraftItem.findMany({
				where: { saleDraftId: draft.id.toString() },
			})
			expect(persistedItems).toHaveLength(0)

			persistedDraft = await prisma.saleDraft.findUniqueOrThrow({
				where: { id: draft.id.toString() },
			})
			expect(persistedDraft.status).toBe('CANCELLED')

			expect(await saleDraftsRepository.findOpenByPdvSessionId(session.id.toString())).toBeNull()
		})
	})
})
