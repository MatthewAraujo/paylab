import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { ArchivedCatalogEntityError } from '../errors/archived-catalog-entity-error'
import { CategoryStatus } from '../types/category-status'
import { CatalogSlug } from '../value-objects/slug'

interface CategoryProps {
	storeId: UniqueEntityID
	name: string
	slug: CatalogSlug
	status: CategoryStatus
	parentCategoryId?: UniqueEntityID | null
	imageAttachmentId?: UniqueEntityID | null
	imageUrl?: string | null
	isVisibleOnHome: boolean
	createdAt: Date
	updatedAt?: Date | null
	archivedAt?: Date | null
}

export class Category extends AggregateRoot<CategoryProps> {
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

	get parentCategoryId() {
		return this.props.parentCategoryId ?? null
	}

	get imageUrl() {
		return this.props.imageUrl ?? null
	}

	get imageAttachmentId() {
		return this.props.imageAttachmentId ?? null
	}

	get isVisibleOnHome() {
		return this.props.isVisibleOnHome
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
		parentCategoryId?: UniqueEntityID | null
		imageAttachmentId?: UniqueEntityID | null
		imageUrl?: string | null
		isVisibleOnHome?: boolean
	}) {
		this.ensureEditable()

		if (props.name !== undefined) {
			this.props.name = props.name
		}

		if (props.parentCategoryId !== undefined) {
			this.props.parentCategoryId = props.parentCategoryId
		}

		if (props.imageUrl !== undefined) {
			this.props.imageUrl = props.imageUrl
		}

		if (props.imageAttachmentId !== undefined) {
			this.props.imageAttachmentId = props.imageAttachmentId
		}

		if (props.isVisibleOnHome !== undefined) {
			this.props.isVisibleOnHome = props.isVisibleOnHome
		}

		this.touch()
	}

	deactivate() {
		this.ensureEditable()
		this.props.status = CategoryStatus.INACTIVE
		this.touch()
	}

	activate() {
		this.ensureEditable()
		this.props.status = CategoryStatus.ACTIVE
		this.touch()
	}

	archive(at = new Date()) {
		this.props.status = CategoryStatus.ARCHIVED
		this.props.archivedAt = at
		this.touch(at)
	}

	private ensureEditable() {
		if (this.props.status === CategoryStatus.ARCHIVED) {
			throw new ArchivedCatalogEntityError()
		}
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	static create(
		props: Optional<
			CategoryProps,
			| 'slug'
			| 'status'
			| 'createdAt'
			| 'parentCategoryId'
			| 'imageAttachmentId'
			| 'imageUrl'
			| 'isVisibleOnHome'
		>,
		id?: UniqueEntityID,
	) {
		return new Category(
			{
				...props,
				slug: props.slug ?? CatalogSlug.createFromText(props.name),
				status: props.status ?? CategoryStatus.ACTIVE,
				parentCategoryId: props.parentCategoryId ?? null,
				imageAttachmentId: props.imageAttachmentId ?? null,
				imageUrl: props.imageUrl ?? null,
				// A newly created category should be visible on the home unless the
				// operator explicitly hides it — this is distinct from the migration
				// backfill for *existing* rows (see T3), which follows a stricter rule.
				isVisibleOnHome: props.isVisibleOnHome ?? true,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
				archivedAt: props.archivedAt ?? null,
			},
			id,
		)
	}
}
