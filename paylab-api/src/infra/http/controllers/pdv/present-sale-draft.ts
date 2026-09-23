import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { PrismaService } from '@/infra/database/prisma/prisma.service'

/**
 * Presents a SaleDraft with every line's price/name recomputed live from the
 * catalog (ADR 0003: SaleDraftItem stores only variantId+quantity, never a
 * price/name snapshot). Shared by the REST response (T9, right after an
 * action) and the Socket.IO `cart:updated` broadcast (T10, a moment later)
 * so the two never disagree on shape — see T9's implementation notes.
 */
export async function presentSaleDraft(prisma: PrismaService, draft: SaleDraft) {
	const variantIds = draft.items.map((item) => item.variantId.toString())

	const variants = variantIds.length
		? await prisma.productVariant.findMany({
				where: { id: { in: variantIds } },
				include: { product: { select: { id: true, name: true } } },
			})
		: []
	const variantById = new Map(variants.map((variant) => [variant.id, variant]))

	const items = draft.items.map((item) => {
		const variant = variantById.get(item.variantId.toString())
		const unitPriceCents = variant?.priceCents ?? null

		return {
			variantId: item.variantId.toString(),
			quantity: item.quantity,
			productId: variant?.product.id ?? null,
			productName: variant?.product.name ?? null,
			variantName: variant?.name ?? null,
			sku: variant?.sku ?? null,
			unitPriceCents,
			lineTotalCents: unitPriceCents !== null ? unitPriceCents * item.quantity : null,
		}
	})

	const totalCents = items.reduce((sum, item) => sum + (item.lineTotalCents ?? 0), 0)

	return {
		id: draft.id.toString(),
		pdvSessionId: draft.pdvSessionId.toString(),
		status: draft.status,
		items,
		unmatchedBarcodes: draft.unmatchedBarcodes,
		totalCents,
		createdAt: draft.createdAt.toISOString(),
		updatedAt: draft.updatedAt?.toISOString() ?? null,
	}
}
