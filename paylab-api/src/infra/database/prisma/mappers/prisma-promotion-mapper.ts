import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'
import { PromotionChannel } from '@/domain/quintalpet/enterprise/types/promotion-channel'
import { PromotionStatus } from '@/domain/quintalpet/enterprise/types/promotion-status'
import { PromotionTargetScope } from '@/domain/quintalpet/enterprise/types/promotion-target-scope'
import { PromotionVisibility } from '@/domain/quintalpet/enterprise/types/promotion-visibility'
import { Prisma, Promotion as PrismaPromotion } from '@prisma/client'

export class PrismaPromotionMapper {
	static toDomain(raw: PrismaPromotion): Promotion {
		return Promotion.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				name: raw.name,
				status: raw.status as unknown as PromotionStatus,
				visibility: raw.visibility as unknown as PromotionVisibility,
				channels: raw.channels as unknown as PromotionChannel[],
				priority: raw.priority,
				isStackable: raw.isStackable,
				targetScope: raw.targetScope as unknown as PromotionTargetScope,
				startsAt: raw.startsAt,
				endsAt: raw.endsAt,
				conditions: raw.conditions,
				benefits: raw.benefits,
				publicHighlight: raw.publicHighlight,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(promotion: Promotion): Prisma.PromotionUncheckedCreateInput {
		return {
			id: promotion.id.toString(),
			storeId: promotion.storeId.toString(),
			name: promotion.name,
			status: promotion.status,
			visibility: promotion.visibility,
			channels: promotion.channels,
			priority: promotion.priority,
			isStackable: promotion.isStackable,
			targetScope: promotion.targetScope,
			startsAt: promotion.startsAt ?? null,
			endsAt: promotion.endsAt ?? null,
			conditions: promotion.conditions as unknown as Prisma.InputJsonValue,
			benefits: promotion.benefits as unknown as Prisma.InputJsonValue,
			publicHighlight:
				(promotion.publicHighlight as unknown as Prisma.InputJsonValue | null) ?? Prisma.JsonNull,
		}
	}
}
