import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import { BarcodeNotInDraftError } from './errors/barcode-not-in-draft-error'
import { VariantBarcodeAlreadySetError } from './errors/variant-barcode-already-set-error'
import { VariantNotFoundError } from './errors/variant-not-found-error'

export interface ResolveUnmatchedBarcodeInput {
	saleDraftId: string
	barcode: string
	variantId: string
}

/**
 * Post-checkout cleanup (US-23/US-24): assigns one of a draft's
 * `unmatchedBarcodes` entries to a `ProductVariant`, writing that variant's
 * `barcode` so future scans of the same code resolve automatically. Does not
 * touch the already-finalized `Order` in any way — it only writes
 * `ProductVariant.barcode` and updates the draft's `unmatchedBarcodes` list.
 *
 * The variant lookup is scoped to the draft's own store (via its
 * `PdvSession`), which doubles as the cross-store guard: a `variantId` from
 * another store simply doesn't match and surfaces as `VariantNotFoundError`,
 * the same error `AddItemToSaleDraftUseCase` (T6) throws for an unknown
 * variant.
 */
@Injectable()
export class ResolveUnmatchedBarcodeUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly saleDraftsRepository: SaleDraftsRepository,
	) {}

	async execute(input: ResolveUnmatchedBarcodeInput): Promise<void> {
		const draft = await this.saleDraftsRepository.findById(input.saleDraftId)
		if (!draft) {
			throw new NotFoundException('Sale draft not found.')
		}

		if (!draft.unmatchedBarcodes.includes(input.barcode)) {
			throw new BarcodeNotInDraftError(input.barcode)
		}

		const session = await this.prisma.pdvSession.findUnique({
			where: { id: draft.pdvSessionId.toString() },
			select: { storeId: true },
		})
		if (!session) {
			throw new NotFoundException('PDV session not found.')
		}

		const variant = await this.prisma.productVariant.findFirst({
			where: { id: input.variantId, storeId: session.storeId },
		})
		if (!variant) {
			throw new VariantNotFoundError(input.variantId)
		}

		if (variant.barcode && variant.barcode !== input.barcode) {
			throw new VariantBarcodeAlreadySetError(input.variantId)
		}

		await this.prisma.productVariant.update({
			where: { id: variant.id },
			data: { barcode: input.barcode },
		})

		draft.removeUnmatchedBarcode(input.barcode)
		await this.saleDraftsRepository.save(draft)
	}
}
