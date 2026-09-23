import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { ArchivedCatalogEntityError } from '../errors/archived-catalog-entity-error'
import { InvalidVariantPricingError } from '../errors/invalid-variant-pricing-error'
import { ProductVariantStatus } from '../types/product-variant-status'
import { Money } from '../value-objects/money'
import { Sku } from '../value-objects/sku'

interface ProductVariantProps {
	sku: Sku
	name: string
	barcode?: string | null
	status: ProductVariantStatus
	price: Money
	cost?: Money | null
	attributes: Record<string, string>
	deactivatedAt?: Date | null
	archivedAt?: Date | null
	createdAt: Date
	updatedAt?: Date | null
}

export class ProductVariant extends Entity<ProductVariantProps> {
	get sku() {
		return this.props.sku
	}

	get name() {
		return this.props.name
	}

	get barcode() {
		return this.props.barcode ?? null
	}

	get status() {
		return this.props.status
	}

	get price() {
		return this.props.price
	}

	get cost() {
		return this.props.cost ?? null
	}

	get attributes() {
		return this.props.attributes
	}

	get deactivatedAt() {
		return this.props.deactivatedAt ?? null
	}

	get archivedAt() {
		return this.props.archivedAt ?? null
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	updateDetails(props: {
		sku?: Sku
		name?: string
		barcode?: string | null
		price?: Money
		cost?: Money | null
		attributes?: Record<string, string>
	}) {
		this.ensureEditable()

		const price = props.price ?? this.props.price
		const cost = props.cost !== undefined ? props.cost : this.props.cost

		ProductVariant.validatePricing({
			price,
			cost,
		})

		this.props.sku = props.sku ?? this.props.sku
		this.props.name = props.name ?? this.props.name
		if (props.barcode !== undefined) {
			this.props.barcode = props.barcode
		}
		this.props.price = price
		this.props.cost = cost

		if (props.attributes !== undefined) {
			this.props.attributes = props.attributes
		}

		this.touch()
	}

	deactivate() {
		this.ensureEditable()
		this.props.status = ProductVariantStatus.INACTIVE
		this.props.deactivatedAt = new Date()
		this.touch()
	}

	activate() {
		this.ensureEditable()
		this.props.status = ProductVariantStatus.ACTIVE
		this.props.deactivatedAt = null
		this.touch()
	}

	private ensureEditable() {
		if (this.props.status === ProductVariantStatus.ARCHIVED) {
			throw new ArchivedCatalogEntityError()
		}
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	private static validatePricing(props: {
		price: Money
		cost?: Money | null
	}) {
		if (props.price.amountInCents < 0) {
			throw new InvalidVariantPricingError()
		}

		if (props.cost && props.cost.amountInCents < 0) {
			throw new InvalidVariantPricingError()
		}
	}

	static create(
		props: Optional<
			ProductVariantProps,
			'barcode' | 'cost' | 'status' | 'deactivatedAt' | 'archivedAt' | 'createdAt'
		>,
		id?: UniqueEntityID,
	) {
		this.validatePricing(props)

		return new ProductVariant(
			{
				...props,
				barcode: props.barcode ?? null,
				status: props.status ?? ProductVariantStatus.ACTIVE,
				cost: props.cost ?? null,
				deactivatedAt: props.deactivatedAt ?? null,
				archivedAt: props.archivedAt ?? null,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
			},
			id,
		)
	}
}
