import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { ArchivedCatalogEntityError } from '../errors/archived-catalog-entity-error'
import { BrandStatus } from '../types/brand-status'
import { CatalogSlug } from '../value-objects/slug'

interface BrandProps {
	storeId: UniqueEntityID
	name: string
	slug: CatalogSlug
	status: BrandStatus
	logoAttachmentId?: UniqueEntityID | null
	logoUrl?: string | null
	createdAt: Date
	updatedAt?: Date | null
	archivedAt?: Date | null
}

export class Brand extends AggregateRoot<BrandProps> {
	get storeId() {
		return this.props.storeId
	}

	get name() {
		return this.props.name
	}

	get slug() {
		return this.props.slug
	}

	get status() {
		return this.props.status
	}

	get logoUrl() {
		return this.props.logoUrl ?? null
	}

	get logoAttachmentId() {
		return this.props.logoAttachmentId ?? null
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	get archivedAt() {
		return this.props.archivedAt ?? null
	}

	updateDetails(props: {
		name?: string
		logoUrl?: string | null
		logoAttachmentId?: UniqueEntityID | null
	}) {
		if (this.props.status === BrandStatus.ARCHIVED) {
			throw new ArchivedCatalogEntityError()
		}

		this.props.name = props.name ?? this.props.name

		if (props.logoUrl !== undefined) {
			this.props.logoUrl = props.logoUrl
		}

		if (props.logoAttachmentId !== undefined) {
			this.props.logoAttachmentId = props.logoAttachmentId
		}

		this.touch()
	}

	deactivate() {
		if (this.props.status === BrandStatus.ARCHIVED) {
			throw new ArchivedCatalogEntityError()
		}

		this.props.status = BrandStatus.INACTIVE
		this.touch()
	}

	activate() {
		if (this.props.status === BrandStatus.ARCHIVED) {
			throw new ArchivedCatalogEntityError()
		}

		this.props.status = BrandStatus.ACTIVE
		this.touch()
	}

	archive(at = new Date()) {
		this.props.status = BrandStatus.ARCHIVED
		this.props.archivedAt = at
		this.touch(at)
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	static create(
		props: Optional<BrandProps, 'slug' | 'status' | 'logoAttachmentId' | 'logoUrl' | 'createdAt'>,
		id?: UniqueEntityID,
	) {
		return new Brand(
			{
				...props,
				slug: props.slug ?? CatalogSlug.createFromText(props.name),
				status: props.status ?? BrandStatus.ACTIVE,
				logoAttachmentId: props.logoAttachmentId ?? null,
				logoUrl: props.logoUrl ?? null,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
				archivedAt: props.archivedAt ?? null,
			},
			id,
		)
	}
}
