import { StoreShippingSettingsRepository } from '@/domain/quintalpet/application/repositories/store-shipping-settings-repository'
import { StoreShippingSettings } from '@/domain/quintalpet/enterprise/entities/store-shipping-settings'
import { PrismaStoreShippingSettingsMapper } from '@/infra/database/prisma/mappers/prisma-store-shipping-settings-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class PrismaStoreShippingSettingsRepository implements StoreShippingSettingsRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findByStoreId(storeId: string): Promise<StoreShippingSettings | null> {
		const record = await this.prisma.storeShippingSettings.findUnique({ where: { storeId } })
		return record ? PrismaStoreShippingSettingsMapper.toDomain(record) : null
	}

	async upsert(settings: StoreShippingSettings): Promise<void> {
		const data = PrismaStoreShippingSettingsMapper.toPrisma(settings)

		await this.prisma.storeShippingSettings.upsert({
			where: { storeId: data.storeId },
			create: data,
			update: {
				originPostalCode: data.originPostalCode,
				baseCents: data.baseCents,
				perKmCents: data.perKmCents,
				maxDistanceKm: data.maxDistanceKm,
				freeShippingDistanceKm: data.freeShippingDistanceKm,
			},
		})
	}
}
