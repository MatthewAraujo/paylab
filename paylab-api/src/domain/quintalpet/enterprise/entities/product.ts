import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { ArchivedCatalogEntityError } from '../errors/archived-catalog-entity-error'
import { InactiveCategoryAssignmentError } from '../errors/inactive-category-assignment-error'
import { InvalidCatalogLifecycleTransitionError } from '../errors/invalid-catalog-lifecycle-transition-error'
import { InvalidPrimaryCategoryError } from '../errors/invalid-primary-category-error'
import { CategoryStatus } from '../types/category-status'
import { ProductStatus } from '../types/product-status'
import { CatalogSlug } from '../value-objects/slug'
import { ProductImage } from './product-image'
import { ProductImageList } from './product-image-list'
import { ProductVariant } from './product-variant'

interface ProductCategoryReference {
	categoryId: UniqueEntityID
	status: CategoryStatus
}

interface AssignProductCategoriesRequest {
	primaryCategoryId: UniqueEntityID
	categories: ProductCategoryReference[]
}

interface ProductProps {
	storeId: UniqueEntityID
	name: string
	slug: CatalogSlug
	description?: string | null
	brandId?: UniqueEntityID | null
	status: ProductStatus
	primaryCategoryId?: UniqueEntityID | null
	categoryIds: UniqueEntityID[]
	variants: ProductVariant[]
	images: ProductImageList
	publishedAt?: Date | null
	deactivatedAt?: Date | null
	createdAt: Date
	updatedAt?: Date | null
	archivedAt?: Date | null
}

export class Product extends AggregateRoot<ProductProps> {
	get storeId() {
		return this.props.storeId
	}

	get name() {
		return this.props.name
	}

	get slug() {
		return this.props.slug
	}

	get description() {
		return this.props.description ?? null
	}

	get brandId() {
		return this.props.brandId ?? null
	}

	get status() {
		return this.props.status
	}

	get primaryCategoryId() {
		return this.props.primaryCategoryId ?? null
	}

	get categoryIds() {
		return this.props.categoryIds
	}

	get variants() {
		return this.props.variants
	}

	get images() {
		return this.props.images.getItems()
	}

	get imageList() {
		return this.props.images
	}

	get publishedAt() {
		return this.props.publishedAt ?? null
	}

	get deactivatedAt() {
		return this.props.deactivatedAt ?? null
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
		description?: string | null
		brandId?: UniqueEntityID | null
	}) {
		this.ensureEditable()
		this.props.name = props.name ?? this.props.name

		if (props.description !== undefined) {
			this.props.description = props.description
		}

		if (props.brandId !== undefined) {
			this.props.brandId = props.brandId
		}

		this.touch()
	}

	assignCategories({ primaryCategoryId, categories }: AssignProductCategoriesRequest) {
		this.ensureEditable()

		if (categories.some((category) => category.status !== CategoryStatus.ACTIVE)) {
			throw new InactiveCategoryAssignmentError()
		}

		const uniqueCategoryIds = Array.from(
			new Map(
				categories.map((category) => [category.categoryId.toString(), category.categoryId]),
			).values(),
		)

		if (!uniqueCategoryIds.some((categoryId) => categoryId.equals(primaryCategoryId))) {
			throw new InvalidPrimaryCategoryError()
		}

		this.props.primaryCategoryId = primaryCategoryId
		this.props.categoryIds = uniqueCategoryIds
		this.touch()
	}

	addVariant(variant: ProductVariant) {
		this.ensureEditable()
		this.props.variants.push(variant)
		this.touch()
	}

	replaceImages(images: ProductImage[]) {
		this.ensureEditable()

		if (images.length > 0 && !images.some((image) => image.isPrimary)) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		if (images.filter((image) => image.isPrimary).length > 1) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		images.forEach((image, index) => {
			image.updateDetails({
				position: index,
			})
		})

		this.props.images.update(images)
		this.touch()
	}

	updateVariant(variantId: UniqueEntityID, props: Parameters<ProductVariant['updateDetails']>[0]) {
		this.ensureEditable()

		const variant = this.props.variants.find((item) => item.id.equals(variantId))

		if (!variant) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		variant.updateDetails(props)
		this.touch()
	}

	deactivateVariant(variantId: UniqueEntityID) {
		this.ensureEditable()

		const variant = this.props.variants.find((item) => item.id.equals(variantId))

		if (!variant) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		variant.deactivate()
		this.touch()
	}

	publish() {
		if (this.props.status !== ProductStatus.DRAFT && this.props.status !== ProductStatus.INACTIVE) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		this.props.status = ProductStatus.ACTIVE
		this.props.publishedAt = this.props.publishedAt ?? new Date()
		this.props.deactivatedAt = null
		this.touch()
	}

	deactivate() {
		if (this.props.status !== ProductStatus.ACTIVE) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		this.props.status = ProductStatus.INACTIVE
		this.props.deactivatedAt = new Date()
		this.touch()
	}

	reactivate() {
		if (this.props.status !== ProductStatus.INACTIVE) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		this.props.status = ProductStatus.ACTIVE
		this.props.deactivatedAt = null
		this.touch()
	}

	archive(at = new Date()) {
		if (
			this.props.status === ProductStatus.ACTIVE ||
			this.props.status === ProductStatus.ARCHIVED
		) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		this.props.status = ProductStatus.ARCHIVED
		this.props.archivedAt = at
		this.touch(at)
	}

	restore() {
		if (this.props.status !== ProductStatus.ARCHIVED) {
			throw new InvalidCatalogLifecycleTransitionError()
		}

		this.props.status = ProductStatus.DRAFT
		this.props.archivedAt = null
		this.touch()
	}

	private ensureEditable() {
		if (this.props.status === ProductStatus.ARCHIVED) {
			throw new ArchivedCatalogEntityError()
		}
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	static create(
		props: Optional<
			Omit<ProductProps, 'images'> & { images?: ProductImage[] },
			| 'description'
			| 'brandId'
			| 'status'
			| 'primaryCategoryId'
			| 'categoryIds'
			| 'variants'
			| 'images'
			| 'publishedAt'
			| 'deactivatedAt'
			| 'createdAt'
		>,
		id?: UniqueEntityID,
	) {
		return new Product(
			{
				...props,
				description: props.description ?? null,
				brandId: props.brandId ?? null,
				status: props.status ?? ProductStatus.DRAFT,
				primaryCategoryId: props.primaryCategoryId ?? null,
				categoryIds: props.categoryIds ?? [],
				variants: props.variants ?? [],
				images: new ProductImageList(props.images ?? []),
				publishedAt: props.publishedAt ?? null,
				deactivatedAt: props.deactivatedAt ?? null,
				createdAt: props.createdAt ?? new Date(),
				updatedAt: props.updatedAt ?? null,
				archivedAt: props.archivedAt ?? null,
			},
			id,
		)
	}
}
