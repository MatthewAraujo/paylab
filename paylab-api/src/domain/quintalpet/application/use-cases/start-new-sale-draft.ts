import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { SaleDraftAlreadyActiveError } from './errors/sale-draft-already-active-error'

export interface StartNewSaleDraftInput {
	pdvSessionId: string
}

/**
 * Opens a fresh, empty SaleDraft under a PdvSession that is OPEN but
 * currently has no active draft.
 *
 * This is the gap `CancelSaleDraftUseCase` (T6) deliberately leaves open:
 * unlike finalize (T7, US-20), cancel does not auto-open a replacement
 * draft, per T6's own test-first plan ("a subsequent add against the
 * cancelled draft throws — there's no active draft to add to"). Without
 * this use case, a session left in that state has no way back into "an
 * active draft exists" short of closing and reopening the whole session.
 * This gives the operator an explicit "start a new sale" action instead.
 *
 * Deliberately throws SaleDraftAlreadyActiveError rather than silently
 * returning the existing draft when one is already OPEN — calling this
 * when a draft is already active is a caller mistake (or a race with
 * another action), not a no-op to swallow.
 */
@Injectable()
export class StartNewSaleDraftUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly saleDraftsRepository: SaleDraftsRepository,
	) {}

	async execute(input: StartNewSaleDraftInput): Promise<SaleDraft> {
		const session = await this.prisma.pdvSession.findUnique({
			where: { id: input.pdvSessionId },
			select: { status: true },
		})
		if (!session || session.status !== 'OPEN') {
			throw new NotFoundException('PDV session not found.')
		}

		const existingDraft = await this.saleDraftsRepository.findOpenByPdvSessionId(input.pdvSessionId)
		if (existingDraft) {
			throw new SaleDraftAlreadyActiveError()
		}

		const draft = SaleDraft.create({ pdvSessionId: new UniqueEntityID(input.pdvSessionId) })
		await this.saleDraftsRepository.save(draft)

		return draft
	}
}
