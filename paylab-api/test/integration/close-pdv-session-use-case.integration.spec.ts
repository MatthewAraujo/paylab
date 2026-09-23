import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { ClosePdvSessionUseCase } from '@/domain/quintalpet/application/use-cases/close-pdv-session'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { SaleDraftNotEmptyError } from '@/domain/quintalpet/enterprise/errors/sale-draft-not-empty-error'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const closePdvSessionUseCase = new ClosePdvSessionUseCase(
	pdvSessionsRepository,
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

describe('ClosePdvSessionUseCase', () => {
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

	test('closing with an empty active draft succeeds and marks the session CLOSED', async () => {
		const { store } = await seedStoreWithVariant('close-empty')
		const session = PdvSession.create({
			storeId: new UniqueEntityID(store.id),
			openedByUserId: 'user-1',
		})
		await pdvSessionsRepository.save(session)
		const draft = SaleDraft.create({ pdvSessionId: session.id })
		await saleDraftsRepository.save(draft)

		const closed = await closePdvSessionUseCase.execute({
			storeId: store.id,
			pdvSessionId: session.id.toString(),
		})

		expect(closed.status).toBe('CLOSED')

		const persisted = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: session.id.toString() },
		})
		expect(persisted.status).toBe('CLOSED')
		expect(persisted.closedAt).not.toBeNull()
	})

	test('closing with a non-empty active draft throws and leaves the session OPEN', async () => {
		const { store, variant } = await seedStoreWithVariant('close-non-empty')
		const session = PdvSession.create({
			storeId: new UniqueEntityID(store.id),
			openedByUserId: 'user-1',
		})
		await pdvSessionsRepository.save(session)
		const draft = SaleDraft.create({ pdvSessionId: session.id })
		draft.addItem(new UniqueEntityID(variant.id), 1)
		await saleDraftsRepository.save(draft)

		await expect(
			closePdvSessionUseCase.execute({ storeId: store.id, pdvSessionId: session.id.toString() }),
		).rejects.toThrow(SaleDraftNotEmptyError)

		const persisted = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: session.id.toString() },
		})
		expect(persisted.status).toBe('OPEN')
	})
})
