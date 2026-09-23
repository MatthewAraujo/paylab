import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { VariantNotFoundError } from './errors/variant-not-found-error'

export interface AddItemToSaleDraftInput {
	pdvSessionId: string
	variantId: string
	quantity?: number
}

/**
 * Shared cart-mutation core used by both the WebSocket scan path (T10, after
 * ResolveVariantByBarcodeUseCase resolves a barcode to a variantId) and the
 * REST manual-add endpoint (T9, which already has a variantId from catalog
 * search). Resolves the store's *active* SaleDraft from `pdvSessionId`
 * internally — callers never pass a `saleDraftId` directly, so there's one
 * place that decides "which draft is currently active."
 *
 * No stock check here — deliberately (US-26, ADR/PRD: "Add-item use case
 * does not validate stock"). Only finalize (T7) checks stock, matching the
 * existing walk-in order behavior.
 */
@Injectable()
export class AddItemToSaleDraftUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly saleDraftsRepository: SaleDraftsRepository,
	) {}

	async execute(input: AddItemToSaleDraftInput): Promise<SaleDraft> {
		const session = await this.prisma.pdvSession.findUnique({
			where: { id: input.pdvSessionId },
			select: { storeId: true },
		})
		if (!session) {
			throw new NotFoundException('PDV session not found.')
		}

		const draft = await this.saleDraftsRepository.findOpenByPdvSessionId(input.pdvSessionId)
		if (!draft) {
			throw new NotFoundException('No active sale draft for this PDV session.')
		}

		const variant = await this.prisma.productVariant.findFirst({
			where: { id: input.variantId, storeId: session.storeId, status: 'ACTIVE' },
		})
		if (!variant) {
			throw new VariantNotFoundError(input.variantId)
		}

		draft.addItem(new UniqueEntityID(variant.id), input.quantity ?? 1)
		await this.saleDraftsRepository.save(draft)

		return draft
	}
}
