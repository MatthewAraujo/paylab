import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { Injectable, NotFoundException } from '@nestjs/common'

export interface CancelSaleDraftInput {
	pdvSessionId: string
}

/**
 * Discards the active SaleDraft entirely (US-14: abandoned cart, customer
 * changed their mind) without closing the register. Empties every line and
 * marks the draft CANCELLED (see `SaleDraft.cancel()`, T3).
 *
 * Deliberately does NOT open a fresh draft afterward — unlike finalize (T7,
 * US-20), a cancel is not itself the start of a new sale. A subsequent add
 * against this session correctly finds no active draft and throws, since
 * `findOpenByPdvSessionId` only ever returns an OPEN draft (T6 test-first
 * plan). Starting the next sale after a cancel is out of this use case's
 * scope.
 */
@Injectable()
export class CancelSaleDraftUseCase {
	constructor(private readonly saleDraftsRepository: SaleDraftsRepository) {}

	async execute(input: CancelSaleDraftInput): Promise<SaleDraft> {
		const draft = await this.saleDraftsRepository.findOpenByPdvSessionId(input.pdvSessionId)
		if (!draft) {
			throw new NotFoundException('No active sale draft for this PDV session.')
		}

		draft.cancel()
		await this.saleDraftsRepository.save(draft)

		return draft
	}
}
