import { PdvSessionsRepository } from '@/domain/quintalpet/application/repositories/pdv-sessions-repository'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'
import { Injectable, NotFoundException } from '@nestjs/common'

export interface ClosePdvSessionInput {
	storeId: string
	pdvSessionId: string
}

/**
 * Closes a PdvSession, blocking (via PdvSession.close(), T2) while its active
 * SaleDraft still has items — an in-progress sale is never silently
 * discarded by closing the till (US-22).
 */
@Injectable()
export class ClosePdvSessionUseCase {
	constructor(
		private readonly pdvSessionsRepository: PdvSessionsRepository,
		private readonly saleDraftsRepository: SaleDraftsRepository,
	) {}

	async execute(input: ClosePdvSessionInput): Promise<PdvSession> {
		const session = await this.pdvSessionsRepository.findById(input.pdvSessionId, input.storeId)
		if (!session) {
			throw new NotFoundException('PDV session not found.')
		}

		const activeDraft = await this.saleDraftsRepository.findOpenByPdvSessionId(
			session.id.toString(),
		)
		const activeDraftHasItems = Boolean(activeDraft && !activeDraft.isEmpty)

		session.close(activeDraftHasItems)

		await this.pdvSessionsRepository.save(session)

		return session
	}
}
