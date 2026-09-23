import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { ResolveVariantByBarcodeUseCase } from '@/domain/quintalpet/application/use-cases/resolve-variant-by-barcode'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const resolveVariantByBarcodeUseCase = new ResolveVariantByBarcodeUseCase(
	prisma,
	saleDraftsRepository,
)

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

async function seedOpenSessionWithVariant(suffix: string, barcode: string | null) {
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
			barcode,
		},
	})

	const session = PdvSession.create({
		storeId: new UniqueEntityID(store.id),
		openedByUserId: 'user-1',
	})
	await pdvSessionsRepository.save(session)
	const draft = SaleDraft.create({ pdvSessionId: session.id })
	await saleDraftsRepository.save(draft)

	return { store, variant, session, draft }
}

describe('ResolveVariantByBarcodeUseCase', () => {
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

	test('resolving a barcode that matches a ProductVariant returns that variant and does not touch the draft', async () => {
		const {
			session,
			variant,
			draft: seededDraft,
		} = await seedOpenSessionWithVariant('resolve-match', '7890000000001')

		const result = await resolveVariantByBarcodeUseCase.execute({
			pdvSessionId: session.id.toString(),
			barcode: '7890000000001',
		})

		expect(result.matched).toBe(true)
		if (result.matched) {
			expect(result.variant.id).toBe(variant.id)
		}

		const persistedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: seededDraft.id.toString() },
			include: { items: true },
		})
		expect(persistedDraft.items).toHaveLength(0)
		expect(persistedDraft.unmatchedBarcodes).toEqual([])
	})

	test('resolves a barcode for a fully out-of-stock variant — the storefront stock-visibility rule does not apply to PDV (ADR 0006 regression guard)', async () => {
		const { store, session, variant } = await seedOpenSessionWithVariant(
			'resolve-sold-out',
			'7890000000009',
		)
		await prisma.inventoryItem.create({
			data: { storeId: store.id, variantId: variant.id, availableQuantity: 0 },
		})

		const result = await resolveVariantByBarcodeUseCase.execute({
			pdvSessionId: session.id.toString(),
			barcode: '7890000000009',
		})

		expect(result.matched).toBe(true)
		if (result.matched) {
			expect(result.variant.id).toBe(variant.id)
		}
	})

	test('resolving a barcode that matches nothing appends it to unmatchedBarcodes, returns a not-matched result, and leaves items untouched', async () => {
		const { session, draft: seededDraft } = await seedOpenSessionWithVariant(
			'resolve-no-match',
			null,
		)

		const result = await resolveVariantByBarcodeUseCase.execute({
			pdvSessionId: session.id.toString(),
			barcode: 'unknown-barcode-123',
		})

		expect(result.matched).toBe(false)
		if (!result.matched) {
			expect(result.barcode).toBe('unknown-barcode-123')
		}

		const persistedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: seededDraft.id.toString() },
			include: { items: true },
		})
		expect(persistedDraft.items).toHaveLength(0)
		expect(persistedDraft.unmatchedBarcodes).toEqual(['unknown-barcode-123'])
	})

	test('resolving the same unmatched barcode twice does not duplicate it in unmatchedBarcodes', async () => {
		const { session, draft: seededDraft } = await seedOpenSessionWithVariant(
			'resolve-no-match-twice',
			null,
		)

		await resolveVariantByBarcodeUseCase.execute({
			pdvSessionId: session.id.toString(),
			barcode: 'repeat-barcode',
		})
		await resolveVariantByBarcodeUseCase.execute({
			pdvSessionId: session.id.toString(),
			barcode: 'repeat-barcode',
		})

		const persistedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: seededDraft.id.toString() },
		})
		expect(persistedDraft.unmatchedBarcodes).toEqual(['repeat-barcode'])
	})
})
