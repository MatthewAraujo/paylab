import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { Prisma, StoreShippingSettings as PrismaStoreShippingSettings } from '@prisma/client'

export class PrismaStoreShippingSettingsMapper {
	static toDomain(raw: PrismaStoreShippingSettings): StoreShippingSettings {
		return StoreShippingSettings.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				originPostalCode: raw.originPostalCode,
				baseCents: raw.baseCents,
				perKmCents: raw.perKmCents,
				maxDistanceKm: raw.maxDistanceKm,
				freeShippingDistanceKm: raw.freeShippingDistanceKm,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(
		settings: StoreShippingSettings,
	): Prisma.StoreShippingSettingsUncheckedCreateInput {
		return {
			id: settings.id.toString(),
			storeId: settings.storeId.toString(),
			originPostalCode: settings.originPostalCode,
			baseCents: settings.baseCents,
			perKmCents: settings.perKmCents,
			maxDistanceKm: settings.maxDistanceKm,
			freeShippingDistanceKm: settings.freeShippingDistanceKm,
		}
	}
}
