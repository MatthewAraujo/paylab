import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { AddItemToSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/add-item-to-sale-draft'
import { CancelSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/cancel-sale-draft'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'
import { NotFoundException } from '@nestjs/common'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const cancelSaleDraftUseCase = new CancelSaleDraftUseCase(saleDraftsRepository)
const addItemToSaleDraftUseCase = new AddItemToSaleDraftUseCase(prisma, saleDraftsRepository)

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

async function seedOpenSessionWithVariant(suffix: string) {
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
	draft.addItem(new UniqueEntityID(variant.id), 2)
	await saleDraftsRepository.save(draft)

	return { store, variant, session, draft }
}

describe('CancelSaleDraftUseCase', () => {
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

	test('cancelling an active draft empties it and marks it CANCELLED', async () => {
		const { session, draft: seededDraft } = await seedOpenSessionWithVariant('cancel-active')

		const cancelled = await cancelSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() })

		expect(cancelled.status).toBe('CANCELLED')
		expect(cancelled.items).toHaveLength(0)

		const persisted = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: seededDraft.id.toString() },
		})
		expect(persisted.status).toBe('CANCELLED')

		const persistedItems = await prisma.saleDraftItem.findMany({
			where: { saleDraftId: seededDraft.id.toString() },
		})
		expect(persistedItems).toHaveLength(0)
	})

	test('a subsequent add against the cancelled draft throws — there is no active draft to add to', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('cancel-then-add')

		await cancelSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() })

		await expect(
			addItemToSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				variantId: variant.id,
			}),
		).rejects.toThrow(NotFoundException)
	})

	test('cancelling when there is no active draft for the session throws', async () => {
		const { session, draft } = await seedOpenSessionWithVariant('cancel-no-active-draft')
		draft.cancel()
		await saleDraftsRepository.save(draft)

		await expect(
			cancelSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() }),
		).rejects.toThrow(NotFoundException)
	})
})
