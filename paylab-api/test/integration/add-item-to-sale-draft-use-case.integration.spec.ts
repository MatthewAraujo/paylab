import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { AddItemToSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/add-item-to-sale-draft'
import { VariantNotFoundError } from '@/domain/quintalpet/application/use-cases/errors/variant-not-found-error'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const addItemToSaleDraftUseCase = new AddItemToSaleDraftUseCase(prisma, saleDraftsRepository)

async function resetDatabase() {
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

async function seedOpenSessionWithVariant(
	suffix: string,
	options: { availableQuantity?: number } = {},
) {
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

	if (options.availableQuantity !== undefined) {
		await prisma.inventoryItem.create({
			data: {
				storeId: store.id,
				variantId: variant.id,
				availableQuantity: options.availableQuantity,
			},
		})
	}

	const session = PdvSession.create({
		storeId: new UniqueEntityID(store.id),
		openedByUserId: 'user-1',
	})
	await pdvSessionsRepository.save(session)
	const draft = SaleDraft.create({ pdvSessionId: session.id })
	await saleDraftsRepository.save(draft)

	return { store, variant, session, draft }
}

describe('AddItemToSaleDraftUseCase', () => {
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

	test('adding a variantId to the active draft creates a new line', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('add-new')

		const draft = await addItemToSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
		})

		expect(draft.items).toHaveLength(1)
		expect(draft.items[0].variantId.toString()).toBe(variant.id)
		expect(draft.items[0].quantity).toBe(1)

		const persisted = await prisma.saleDraftItem.findMany({
			where: { saleDraftId: draft.id.toString() },
		})
		expect(persisted).toHaveLength(1)
		expect(persisted[0].quantity).toBe(1)
	})

	test('adding the same variantId twice increments the existing line instead of duplicating it', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('add-increment')

		await addItemToSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
		})
		const draft = await addItemToSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
			quantity: 2,
		})

		expect(draft.items).toHaveLength(1)
		expect(draft.items[0].quantity).toBe(3)

		const persisted = await prisma.saleDraftItem.findMany({
			where: { saleDraftId: draft.id.toString() },
		})
		expect(persisted).toHaveLength(1)
		expect(persisted[0].quantity).toBe(3)
	})

	test('adding a variant with zero available stock still succeeds — no stock check on PDV add (US-26 regression guard)', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('add-zero-stock', {
			availableQuantity: 0,
		})

		const draft = await addItemToSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
		})

		expect(draft.items).toHaveLength(1)
		expect(draft.items[0].quantity).toBe(1)
	})

	test('adding a variant with negative available stock still succeeds — no stock check on PDV add (US-26 regression guard)', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('add-negative-stock', {
			availableQuantity: -3,
		})

		const draft = await addItemToSaleDraftUseCase.execute({
			pdvSessionId: session.id.toString(),
			variantId: variant.id,
		})

		expect(draft.items).toHaveLength(1)
		expect(draft.items[0].quantity).toBe(1)
	})

	test('adding an unknown variantId throws VariantNotFoundError', async () => {
		const { session } = await seedOpenSessionWithVariant('add-unknown-variant')

		await expect(
			addItemToSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				variantId: '00000000-0000-0000-0000-000000000000',
			}),
		).rejects.toThrow(VariantNotFoundError)
	})

	test('adding an inactive variantId throws VariantNotFoundError', async () => {
		const { session, variant } = await seedOpenSessionWithVariant('add-inactive-variant')
		await prisma.productVariant.update({ where: { id: variant.id }, data: { status: 'INACTIVE' } })

		await expect(
			addItemToSaleDraftUseCase.execute({
				pdvSessionId: session.id.toString(),
				variantId: variant.id,
			}),
		).rejects.toThrow(VariantNotFoundError)
	})
})
