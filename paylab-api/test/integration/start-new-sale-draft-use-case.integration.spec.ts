import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { SaleDraftAlreadyActiveError } from '@/domain/quintalpet/application/use-cases/errors/sale-draft-already-active-error'
import { StartNewSaleDraftUseCase } from '@/domain/quintalpet/application/use-cases/start-new-sale-draft'
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
const startNewSaleDraftUseCase = new StartNewSaleDraftUseCase(prisma, saleDraftsRepository)

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

async function seedOpenSession(suffix: string) {
	const store = await prisma.store.create({
		data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` },
	})

	const session = PdvSession.create({
		storeId: new UniqueEntityID(store.id),
		openedByUserId: 'user-1',
	})
	await pdvSessionsRepository.save(session)

	return { store, session }
}

describe('StartNewSaleDraftUseCase', () => {
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

	test('opens a fresh empty draft when the session is OPEN and has no active draft', async () => {
		const { session } = await seedOpenSession('start-fresh')

		const draft = await startNewSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() })

		expect(draft.status).toBe('OPEN')
		expect(draft.items).toHaveLength(0)
		expect(draft.pdvSessionId.toString()).toBe(session.id.toString())

		const persisted = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id.toString() },
		})
		expect(persisted.status).toBe('OPEN')
		expect(persisted.pdvSessionId).toBe(session.id.toString())
	})

	test('starting a new draft after a cancel succeeds — this is the gap CancelSaleDraftUseCase deliberately leaves open', async () => {
		const { session } = await seedOpenSession('start-after-cancel')
		const cancelledDraft = SaleDraft.create({ pdvSessionId: session.id })
		cancelledDraft.cancel()
		await saleDraftsRepository.save(cancelledDraft)

		const draft = await startNewSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() })

		expect(draft.status).toBe('OPEN')
		expect(draft.id.toString()).not.toBe(cancelledDraft.id.toString())
	})

	test('throws SaleDraftAlreadyActiveError when the session already has an OPEN draft', async () => {
		const { session } = await seedOpenSession('start-already-active')
		const existingDraft = SaleDraft.create({ pdvSessionId: session.id })
		await saleDraftsRepository.save(existingDraft)

		await expect(
			startNewSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() }),
		).rejects.toThrow(SaleDraftAlreadyActiveError)

		const drafts = await prisma.saleDraft.findMany({
			where: { pdvSessionId: session.id.toString() },
		})
		expect(drafts).toHaveLength(1)
	})

	test('throws NotFoundException when the PDV session does not exist', async () => {
		await expect(
			startNewSaleDraftUseCase.execute({ pdvSessionId: 'non-existent-session-id' }),
		).rejects.toThrow(NotFoundException)
	})

	test('throws NotFoundException when the PDV session is CLOSED', async () => {
		const { session } = await seedOpenSession('start-closed-session')
		session.close(false)
		await pdvSessionsRepository.save(session)

		await expect(
			startNewSaleDraftUseCase.execute({ pdvSessionId: session.id.toString() }),
		).rejects.toThrow(NotFoundException)
	})
})
