import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CuratedHomeOffer } from '@/domain/quintalpet/enterprise/entities/curated-home-offer'
import { Prisma, CuratedHomeOffer as PrismaCuratedHomeOffer } from '@prisma/client'

export class PrismaCuratedHomeOfferMapper {
	static toDomain(raw: PrismaCuratedHomeOffer): CuratedHomeOffer {
		return CuratedHomeOffer.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				promotionId: new UniqueEntityID(raw.promotionId),
				position: raw.position,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(offer: CuratedHomeOffer): Prisma.CuratedHomeOfferUncheckedCreateInput {
		return {
			id: offer.id.toString(),
			storeId: offer.storeId.toString(),
			promotionId: offer.promotionId.toString(),
			position: offer.position,
		}
	}
}
