import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { DuplicateMerchandisingReferenceError } from '../errors/duplicate-merchandising-reference-error'
import { InvalidMerchandisingReferenceError } from '../errors/invalid-merchandising-reference-error'
import { MerchandisingLimitExceededError } from '../errors/merchandising-limit-exceeded-error'

const DEFAULT_FEATURED_CATEGORY_LIMIT = 24
const DEFAULT_FEATURED_PRODUCT_LIMIT = 8

type MerchandisingReference = {
	entityId: UniqueEntityID
	storeId: UniqueEntityID
}

interface HomeMerchandisingConfigurationProps {
	storeId: UniqueEntityID
	featuredCategoryIds: UniqueEntityID[]
	featuredProductIds: UniqueEntityID[]
	createdAt: Date
	updatedAt?: Date | null
}

/**
 * Featured categories are a flat, ordered list — which storefront
 * "department" (root category) each one belongs to is derived from the
 * category's own parent at query time, not stored here. This keeps the
 * aggregate agnostic to how many departments the store has.
 */
export class HomeMerchandisingConfiguration extends AggregateRoot<HomeMerchandisingConfigurationProps> {
	get storeId() {
		return this.props.storeId
	}

	get featuredCategoryIds() {
		return this.props.featuredCategoryIds
	}

	get featuredProductIds() {
		return this.props.featuredProductIds
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	replaceFeaturedCategories(
		references: MerchandisingReference[],
		limit = DEFAULT_FEATURED_CATEGORY_LIMIT,
	) {
		this.assertReferencesBelongToStore(references, 'category')
		this.assertLimit(references, limit, 'category')
		this.assertUnique(references, 'category')

		this.props.featuredCategoryIds = references.map((reference) => reference.entityId)
		this.props.updatedAt = new Date()
	}

	replaceFeaturedProducts(
		references: MerchandisingReference[],
		limit = DEFAULT_FEATURED_PRODUCT_LIMIT,
	) {
		this.assertReferencesBelongToStore(references, 'product')
		this.assertLimit(references, limit, 'product')
		this.assertUnique(references, 'product')

		this.props.featuredProductIds = references.map((reference) => reference.entityId)
		this.props.updatedAt = new Date()
	}

	private assertReferencesBelongToStore(
		references: MerchandisingReference[],
		entityType: 'category' | 'product',
	) {
		for (const reference of references) {
			if (!reference.storeId.equals(this.storeId)) {
				throw new InvalidMerchandisingReferenceError(entityType)
			}
		}
	}

	private assertLimit(
		references: MerchandisingReference[],
		limit: number,
		entityType: 'category' | 'product',
	) {
		if (references.length > limit) {
			throw new MerchandisingLimitExceededError(entityType, limit)
		}
	}

	private assertUnique(references: MerchandisingReference[], entityType: 'category' | 'product') {
		const ids = references.map((reference) => reference.entityId.toString())

		if (new Set(ids).size !== ids.length) {
			throw new DuplicateMerchandisingReferenceError(entityType)
		}
	}

	static create(
		props: Optional<
			HomeMerchandisingConfigurationProps,
			'featuredCategoryIds' | 'featuredProductIds' | 'createdAt'
		>,
		id?: UniqueEntityID,
	) {
		return new HomeMerchandisingConfiguration(
			{
				...props,
				featuredCategoryIds: props.featuredCategoryIds ?? [],
				featuredProductIds: props.featuredProductIds ?? [],
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
			},
			id,
		)
	}
}
