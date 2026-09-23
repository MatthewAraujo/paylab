import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'

interface ProductImageProps {
	attachmentId: UniqueEntityID
	url: string
	altText?: string | null
	position: number
	isPrimary: boolean
	createdAt?: Date
	updatedAt?: Date | null
}

export class ProductImage extends Entity<ProductImageProps> {
	get attachmentId() {
		return this.props.attachmentId
	}

	get url() {
		return this.props.url
	}

	get altText() {
		return this.props.altText ?? null
	}

	get position() {
		return this.props.position
	}

	get isPrimary() {
		return this.props.isPrimary
	}

	get createdAt() {
		return this.props.createdAt ?? null
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	updateDetails(props: {
		altText?: string | null
		position?: number
		isPrimary?: boolean
		url?: string
	}) {
		if (props.altText !== undefined) {
			this.props.altText = props.altText
		}

		if (props.position !== undefined) {
			this.props.position = props.position
		}

		if (props.isPrimary !== undefined) {
			this.props.isPrimary = props.isPrimary
		}

		if (props.url !== undefined) {
			this.props.url = props.url
		}

		this.props.updatedAt = new Date()
	}

	static create(props: ProductImageProps, id?: UniqueEntityID) {
		return new ProductImage(
			{
				...props,
				altText: props.altText ?? null,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
			},
			id,
		)
	}
}
