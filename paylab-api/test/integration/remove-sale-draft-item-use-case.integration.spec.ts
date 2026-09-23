import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { RemoveOrAdjustSaleDraftItemUseCase } from '@/domain/quintalpet/application/use-cases/remove-sale-draft-item'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { InvalidSaleDraftQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-sale-draft-quantity-error'
import { SaleDraftItemNotFoundError } from '@/domain/quintalpet/enterprise/errors/sale-draft-item-not-found-error'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'
import { NotFoundException } from '@nestjs/common'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const removeOrAdjustSaleDraftItemUseCase = new RemoveOrAdjustSaleDraftItemUseCase(
	saleDraftsRepository,
)

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
	draft.addItem(new UniqueEntityID(variant.id), 3)
	await saleDraftsRepository.save(draft)

	return { store, variant, session, draft }
}

describe('RemoveOrAdjustSaleDraftItemUseCase', () => {
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

	test('reducing a line quantity by less than its total keeps the line with the reduced quantity', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('reduce-partial')

		const draft = await removeOrAdjustSaleDraftItemUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
			quantity: 1,
		})

		expect(draft.items).toHaveLength(1)
		expect(draft.items[0].quantity).toBe(2)

		const persisted = await prisma.saleDraftItem.findMany({
			where: { saleDraftId: draft.id.toString() },
		})
		expect(persisted).toHaveLength(1)
		expect(persisted[0].quantity).toBe(2)
	})

	test('reducing a line quantity down to exactly 0 removes the line entirely', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('reduce-to-zero')

		const draft = await removeOrAdjustSaleDraftItemUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
			quantity: 3,
		})

		expect(draft.items).toHaveLength(0)

		const persisted = await prisma.saleDraftItem.findMany({
			where: { saleDraftId: draft.id.toString() },
		})
		expect(persisted).toHaveLength(0)
	})

	test('reducing a line quantity past its total throws InvalidSaleDraftQuantityError and leaves the line untouched', async () => {
		const {
			session,
			variant,
			draft: seededDraft,
		} = await seedOpenSessionWithVariant('reduce-past-total')

		await expect(
			removeOrAdjustSaleDraftItemUseCase.execute({
				pdvSessionId: session.id.toString(),
				variantId: variant.id,
				quantity: 4,
			}),
		).rejects.toThrow(InvalidSaleDraftQuantityError)

		const persisted = await prisma.saleDraftItem.findMany({
			where: { saleDraftId: seededDraft.id.toString() },
		})
		expect(persisted).toHaveLength(1)
		expect(persisted[0].quantity).toBe(3)
	})

	test('removing a line entirely (no quantity given) drops it regardless of its current quantity', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('remove-entire-line')

		const draft = await removeOrAdjustSaleDraftItemUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
		})

		expect(draft.items).toHaveLength(0)
	})

	test('removing a variantId with no line in the draft throws SaleDraftItemNotFoundError', async () => {
		const { session } = await seedOpenSessionWithVariant('remove-no-line')

		await expect(
			removeOrAdjustSaleDraftItemUseCase.execute({
				pdvSessionId: session.id.toString(),
				variantId: '00000000-0000-0000-0000-000000000000',
			}),
		).rejects.toThrow(SaleDraftItemNotFoundError)
	})

	test('removing from a draft that is not OPEN (already cancelled) throws', async () => {
		const { session, draft } = await seedOpenSessionWithVariant('remove-not-open')
		draft.cancel()
		await saleDraftsRepository.save(draft)

		await expect(
			removeOrAdjustSaleDraftItemUseCase.execute({
				pdvSessionId: session.id.toString(),
				variantId: '00000000-0000-0000-0000-000000000000',
			}),
		).rejects.toThrow(NotFoundException)
	})
})
