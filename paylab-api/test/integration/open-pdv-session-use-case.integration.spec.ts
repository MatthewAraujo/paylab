import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { OpenPdvSessionUseCase } from '@/domain/quintalpet/application/use-cases/open-pdv-session'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { StalePdvSessionRequiresConfirmationError } from '@/domain/quintalpet/enterprise/errors/stale-pdv-session-requires-confirmation-error'
import { PdvSessionStatus } from '@/domain/quintalpet/enterprise/types/pdv-session-status'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaPdvSessionsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-pdv-sessions-repository'
import { PrismaSaleDraftsRepository } from '@/infra/database/prisma/repositories/pdv/prisma-sale-drafts-repository'
import { PrismaStoresRepository } from '@/infra/database/prisma/repositories/prisma-stores-repository'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const pdvSessionsRepository: PdvSessionsRepository = new PrismaPdvSessionsRepository(prisma)
const saleDraftsRepository: SaleDraftsRepository = new PrismaSaleDraftsRepository(prisma)
const storesRepository: StoresRepository = new PrismaStoresRepository(prisma)
const openPdvSessionUseCase = new OpenPdvSessionUseCase(
	prisma,
	pdvSessionsRepository,
	saleDraftsRepository,
	storesRepository,
)

async function resetDatabase() {
	await prisma.saleDraftItem.deleteMany()
	await prisma.saleDraft.deleteMany()
	await prisma.pdvSession.deleteMany()
	await prisma.store.deleteMany()
}

async function seedStore(suffix: string) {
	return prisma.store.create({ data: { name: `Loja ${suffix}`, slug: `loja-${suffix}` } })
}

describe('OpenPdvSessionUseCase', () => {
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

	test('opening with no existing session for the store creates one and an empty SaleDraft under it', async () => {
		const store = await seedStore('open-fresh')

		const { session, draft } = await openPdvSessionUseCase.execute({
			storeId: store.id,
			openedByUserId: 'user-1',
		})

		expect(session.status).toBe(PdvSessionStatus.OPEN)
		expect(draft.isOpen).toBe(true)
		expect(draft.isEmpty).toBe(true)

		const persistedSession = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: session.id.toString() },
		})
		expect(persistedSession.storeId).toBe(store.id)

		const persistedDraft = await prisma.saleDraft.findUniqueOrThrow({
			where: { id: draft.id.toString() },
		})
		expect(persistedDraft.pdvSessionId).toBe(session.id.toString())
		expect(persistedDraft.status).toBe('OPEN')
	})

	test('opening while a same-day OPEN session exists throws, without creating anything', async () => {
		const store = await seedStore('open-same-day')
		const { session: firstSession } = await openPdvSessionUseCase.execute({
			storeId: store.id,
			openedByUserId: 'user-1',
		})

		await expect(
			openPdvSessionUseCase.execute({ storeId: store.id, openedByUserId: 'user-2' }),
		).rejects.toThrow(PdvSessionAlreadyOpenError)

		expect(await prisma.pdvSession.count({ where: { storeId: store.id } })).toBe(1)
		const stillOpen = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: firstSession.id.toString() },
		})
		expect(stillOpen.status).toBe('OPEN')
	})

	test('opening while a prior-day OPEN session exists throws a distinguishable stale-session error without confirmation, and closes+replaces it with confirmation', async () => {
		const store = await seedStore('open-stale')
		const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)

		const staleSession = PdvSession.create({
			storeId: new UniqueEntityID(store.id),
			openedByUserId: 'user-1',
			openedAt: twoDaysAgo,
		})
		await pdvSessionsRepository.save(staleSession)

		await expect(
			openPdvSessionUseCase.execute({ storeId: store.id, openedByUserId: 'user-2' }),
		).rejects.toThrow(StalePdvSessionRequiresConfirmationError)

		const stillOpenAfterRejection = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: staleSession.id.toString() },
		})
		expect(stillOpenAfterRejection.status).toBe('OPEN')

		const { session, draft } = await openPdvSessionUseCase.execute({
			storeId: store.id,
			openedByUserId: 'user-2',
			confirmStaleSessionReplacement: true,
		})

		expect(session.openedByUserId).toBe('user-2')
		expect(draft.pdvSessionId.toString()).toBe(session.id.toString())

		const closedStale = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: staleSession.id.toString() },
		})
		expect(closedStale.status).toBe('CLOSED')
		expect(closedStale.closedAt).not.toBeNull()

		const newSessionRecord = await prisma.pdvSession.findUniqueOrThrow({
			where: { id: session.id.toString() },
		})
		expect(newSessionRecord.status).toBe('OPEN')
	})

	test('two concurrent open attempts for the same store: only one succeeds, the other gets PdvSessionAlreadyOpenError', async () => {
		const store = await seedStore('open-race')

		const [first, second] = await Promise.allSettled([
			openPdvSessionUseCase.execute({ storeId: store.id, openedByUserId: 'user-1' }),
			openPdvSessionUseCase.execute({ storeId: store.id, openedByUserId: 'user-2' }),
		])

		const results = [first, second]
		const fulfilled = results.filter((r) => r.status === 'fulfilled')
		const rejected = results.filter((r) => r.status === 'rejected')

		expect(fulfilled).toHaveLength(1)
		expect(rejected).toHaveLength(1)
		expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(PdvSessionAlreadyOpenError)

		expect(await prisma.pdvSession.count({ where: { storeId: store.id, status: 'OPEN' } })).toBe(1)
	})
})
