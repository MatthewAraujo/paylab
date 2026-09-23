import { CuratedHomeOffersRepository } from '@/domain/quintalpet/application/repositories/curated-home-offers-repository'
import { CuratedHomeOffer } from '@/domain/quintalpet/enterprise/entities/curated-home-offer'
import { PrismaCuratedHomeOfferMapper } from '@/infra/database/prisma/mappers/prisma-curated-home-offer-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class PrismaCuratedHomeOffersRepository implements CuratedHomeOffersRepository {
	constructor(private readonly prisma: PrismaService) {}

	async listByStore(storeId: string): Promise<CuratedHomeOffer[]> {
		const rows = await this.prisma.curatedHomeOffer.findMany({
			where: { storeId },
			orderBy: { position: 'asc' },
		})

		return rows.map(PrismaCuratedHomeOfferMapper.toDomain)
	}

	async replaceForStore(storeId: string, offers: CuratedHomeOffer[]): Promise<void> {
		await this.prisma.$transaction(async (tx) => {
			await tx.curatedHomeOffer.deleteMany({ where: { storeId } })

			if (offers.length > 0) {
				await tx.curatedHomeOffer.createMany({
					data: offers.map((offer) => PrismaCuratedHomeOfferMapper.toPrisma(offer)),
				})
			}
		})
	}

	async removeByPromotionId(promotionId: string, storeId: string): Promise<void> {
		await this.prisma.curatedHomeOffer.deleteMany({
			where: { promotionId, storeId },
		})
	}
}
