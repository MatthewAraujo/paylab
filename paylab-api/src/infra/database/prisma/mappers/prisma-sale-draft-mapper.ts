import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import { SaleDraftItem } from '@/domain/quintalpet/enterprise/entities/sale-draft-item'
import { SaleDraftStatus } from '@/domain/quintalpet/enterprise/types/sale-draft-status'
import { Prisma } from '@prisma/client'

export type PrismaSaleDraftAggregate = Prisma.SaleDraftGetPayload<{
	include: { items: true }
}>

type PrismaSaleDraftItemRecord = Prisma.SaleDraftItemGetPayload<Record<string, never>>

export class PrismaSaleDraftItemMapper {
	static toDomain(raw: PrismaSaleDraftItemRecord): SaleDraftItem {
		return SaleDraftItem.create(
			{
				saleDraftId: new UniqueEntityID(raw.saleDraftId),
				variantId: new UniqueEntityID(raw.variantId),
				quantity: raw.quantity,
			},
			new UniqueEntityID(raw.id),
		)
	}
}

export class PrismaSaleDraftMapper {
	static toDomain(raw: PrismaSaleDraftAggregate): SaleDraft {
		return SaleDraft.create(
			{
				pdvSessionId: new UniqueEntityID(raw.pdvSessionId),
				status: raw.status as SaleDraftStatus,
				items: raw.items.map(PrismaSaleDraftItemMapper.toDomain),
				unmatchedBarcodes: raw.unmatchedBarcodes as string[],
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(draft: SaleDraft): Prisma.SaleDraftUncheckedCreateInput {
		return {
			id: draft.id.toString(),
			pdvSessionId: draft.pdvSessionId.toString(),
			status: draft.status,
			unmatchedBarcodes: draft.unmatchedBarcodes as Prisma.InputJsonValue,
			createdAt: draft.createdAt,
			updatedAt: draft.updatedAt ?? undefined,
		}
	}
}
