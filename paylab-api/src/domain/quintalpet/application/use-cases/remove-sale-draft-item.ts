import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { Injectable, NotFoundException } from '@nestjs/common'

export interface RemoveOrAdjustSaleDraftItemInput {
	pdvSessionId: string
	variantId: string
	/**
	 * Amount to reduce the line's quantity by. Omit to drop the line entirely,
	 * regardless of its current quantity (PRD US-13: "remove a line or reduce
	 * its quantity"). Reducing to exactly 0 also removes the line — see
	 * `SaleDraft.reduceItemQuantity` (T3).
	 */
	quantity?: number
}

/**
 * Corrects a mistaken scan or manual add on the active SaleDraft: removes a
 * line outright, or reduces its quantity (dropping to 0 removes it). Resolves
 * the store's active SaleDraft from `pdvSessionId` the same way
 * AddItemToSaleDraftUseCase (T6) does — a draft that isn't OPEN (already
 * COMPLETED/CANCELLED) has no active draft to resolve, which surfaces here as
 * a NotFoundException rather than a domain error, consistent with how the
 * rest of this codebase treats "resource not found."
 */
@Injectable()
export class RemoveOrAdjustSaleDraftItemUseCase {
	constructor(private readonly saleDraftsRepository: SaleDraftsRepository) {}

	async execute(input: RemoveOrAdjustSaleDraftItemInput): Promise<SaleDraft> {
		const draft = await this.saleDraftsRepository.findOpenByPdvSessionId(input.pdvSessionId)
		if (!draft) {
			throw new NotFoundException('No active sale draft for this PDV session.')
		}

		const variantId = new UniqueEntityID(input.variantId)

		if (input.quantity === undefined) {
			draft.removeItem(variantId)
		} else {
			draft.reduceItemQuantity(variantId, input.quantity)
		}

		await this.saleDraftsRepository.save(draft)

		return draft
	}
}
