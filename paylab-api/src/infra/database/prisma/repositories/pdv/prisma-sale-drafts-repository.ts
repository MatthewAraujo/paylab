import { SaleDraftsRepository } from '@/domain/quintalpet/application/repositories/sale-drafts-repository'
import { SaleDraft } from '@/domain/quintalpet/enterprise/entities/sale-draft'
import {
	PrismaSaleDraftAggregate,
	PrismaSaleDraftMapper,
} from '@/infra/database/prisma/mappers/prisma-sale-draft-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const saleDraftInclude = { items: true }

@Injectable()
export class PrismaSaleDraftsRepository implements SaleDraftsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findOpenByPdvSessionId(pdvSessionId: string): Promise<SaleDraft | null> {
		const record = await this.prisma.saleDraft.findFirst({
			where: { pdvSessionId, status: 'OPEN' },
			include: saleDraftInclude,
		})

		return record ? PrismaSaleDraftMapper.toDomain(record as PrismaSaleDraftAggregate) : null
	}

	async findById(saleDraftId: string): Promise<SaleDraft | null> {
		const record = await this.prisma.saleDraft.findUnique({
			where: { id: saleDraftId },
			include: saleDraftInclude,
		})

		return record ? PrismaSaleDraftMapper.toDomain(record as PrismaSaleDraftAggregate) : null
	}

	async save(draft: SaleDraft, tx?: Prisma.TransactionClient): Promise<void> {
		const client = tx ?? this.prisma
		const data = PrismaSaleDraftMapper.toPrisma(draft)

		await client.saleDraft.upsert({
			where: { id: draft.id.toString() },
			create: data,
			update: {
				status: draft.status,
				unmatchedBarcodes: data.unmatchedBarcodes,
				updatedAt: draft.updatedAt ?? undefined,
			},
		})

		const currentVariantIds = draft.items.map((item) => item.variantId.toString())

		// Reconciles child rows against the entity's current item list: drop
		// anything no longer present (remove/reduce-to-zero/cancel), then
		// upsert what remains (new lines and quantity changes).
		await client.saleDraftItem.deleteMany({
			where: {
				saleDraftId: draft.id.toString(),
				...(currentVariantIds.length > 0 ? { variantId: { notIn: currentVariantIds } } : {}),
			},
		})

		for (const item of draft.items) {
			await client.saleDraftItem.upsert({
				where: {
					saleDraftId_variantId: {
						saleDraftId: draft.id.toString(),
						variantId: item.variantId.toString(),
					},
				},
				create: {
					id: item.id.toString(),
					saleDraftId: draft.id.toString(),
					variantId: item.variantId.toString(),
					quantity: item.quantity,
				},
				update: { quantity: item.quantity },
			})
		}
	}
}
