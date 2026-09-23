import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'

export interface ResolveVariantByBarcodeInput {
	pdvSessionId: string
	barcode: string
}

export interface ResolvedVariant {
	id: string
	productId: string
	name: string
	sku: string
	priceCents: number
}

export type ResolveVariantByBarcodeOutput =
	| { matched: true; variant: ResolvedVariant }
	| { matched: false; barcode: string }

/**
 * Looks a scanned barcode up against `ProductVariant.barcode` (never `sku`,
 * PRD US-8), scoped to the PDV session's store. This is a separate step ahead
 * of `AddItemToSaleDraftUseCase` (T6 implementation notes) — the WebSocket
 * scan path (T10) calls this first and only calls the add use case once it
 * has a resolved `variantId`; the REST manual-add path skips this entirely
 * since it already has a `variantId` from catalog search.
 *
 * A match returns the variant without touching the draft at all. A miss
 * records the barcode on the draft's `unmatchedBarcodes` list (idempotently —
 * see `SaleDraft.addUnmatchedBarcode`, T3) so it can be resolved later (T8),
 * but leaves the cart's items untouched and unchanged (US-10): scanning
 * something unrecognized never blocks or silently alters the sale.
 */
@Injectable()
export class ResolveVariantByBarcodeUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly saleDraftsRepository: SaleDraftsRepository,
	) {}

	async execute(input: ResolveVariantByBarcodeInput): Promise<ResolveVariantByBarcodeOutput> {
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
			where: { storeId: session.storeId, barcode: input.barcode, status: 'ACTIVE' },
		})

		if (!variant) {
			draft.addUnmatchedBarcode(input.barcode)
			await this.saleDraftsRepository.save(draft)
			return { matched: false, barcode: input.barcode }
		}

		return {
			matched: true,
			variant: {
				id: variant.id,
				productId: variant.productId,
				name: variant.name,
				sku: variant.sku,
				priceCents: variant.priceCents,
			},
		}
	}
}
