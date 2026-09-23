import { Promotion } from '@/domain/quintalpet/enterprise/entities/promotion'

export function presentPromotion(promotion: Promotion) {
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
		startsAt: promotion.startsAt?.toISOString() ?? null,
		endsAt: promotion.endsAt?.toISOString() ?? null,
		conditions: promotion.conditions,
		benefits: promotion.benefits,
		publicHighlight: promotion.publicHighlight,
		isEligibleForPublicDiscovery: promotion.isEligibleForPublicDiscovery(),
		createdAt: promotion.createdAt.toISOString(),
		updatedAt: promotion.updatedAt?.toISOString() ?? null,
	}
}
