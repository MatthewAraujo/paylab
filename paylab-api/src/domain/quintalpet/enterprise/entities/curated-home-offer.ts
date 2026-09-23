import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidPromotionError } from '../errors/invalid-promotion-error'

export interface CuratedHomeOfferProps {
	storeId: UniqueEntityID
	promotionId: UniqueEntityID
	/** 1-based slot in the storefront "ofertas" lane, unique per store. */
	position: number
	createdAt: Date
	updatedAt: Date | null
}

export class CuratedHomeOffer extends Entity<CuratedHomeOfferProps> {
	get storeId() {
		return this.props.storeId
	}
	get promotionId() {
		return this.props.promotionId
	}
	get position() {
		return this.props.position
	}
	get createdAt() {
		return this.props.createdAt
	}
	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	static create(
		props: Optional<CuratedHomeOfferProps, 'createdAt' | 'updatedAt'>,
		id?: UniqueEntityID,
	): CuratedHomeOffer {
		if (!Number.isInteger(props.position) || props.position < 1) {
			throw new InvalidPromotionError('curated home offer position must be a positive integer')
		}

		return new CuratedHomeOffer(
			{
				storeId: props.storeId,
				promotionId: props.promotionId,
				position: props.position,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
			},
			id,
		)
	}
}
