import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Category } from '@/domain/quintalpet/enterprise/entities/category'
import { Product } from '@/domain/quintalpet/enterprise/entities/product'
import { ProductImage } from '@/domain/quintalpet/enterprise/entities/product-image'
import { ProductVariant } from '@/domain/quintalpet/enterprise/entities/product-variant'
import { ArchivedCatalogEntityError } from '@/domain/quintalpet/enterprise/errors/archived-catalog-entity-error'
import { CategoryCycleError } from '@/domain/quintalpet/enterprise/errors/category-cycle-error'
import { InactiveCategoryAssignmentError } from '@/domain/quintalpet/enterprise/errors/inactive-category-assignment-error'
import { InvalidCatalogLifecycleTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-catalog-lifecycle-transition-error'
import { InvalidPrimaryCategoryError } from '@/domain/quintalpet/enterprise/errors/invalid-primary-category-error'
import { InvalidVariantPricingError } from '@/domain/quintalpet/enterprise/errors/invalid-variant-pricing-error'
import { ensureCategoryParentingIsAcyclic } from '@/domain/quintalpet/enterprise/services/ensure-category-parenting-is-acyclic'
import { generateCategorySlug } from '@/domain/quintalpet/enterprise/services/generate-category-slug'
import { generateVariantSku } from '@/domain/quintalpet/enterprise/services/generate-variant-sku'
import { CategoryStatus } from '@/domain/quintalpet/enterprise/types/category-status'
import { ProductStatus } from '@/domain/quintalpet/enterprise/types/product-status'
import { Money } from '@/domain/quintalpet/enterprise/value-objects/money'
import { Sku } from '@/domain/quintalpet/enterprise/value-objects/sku'
import { CatalogSlug } from '@/domain/quintalpet/enterprise/value-objects/slug'

describe('quintal agro pet catalog domain', () => {
	test('product lifecycle uses explicit publish, deactivate, reactivate, and archive transitions', () => {
		const product = Product.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Racao Premium',
			slug: CatalogSlug.createFromText('Racao Premium'),
		})

		expect(product.status).toBe(ProductStatus.DRAFT)

		product.publish()
		expect(product.status).toBe(ProductStatus.ACTIVE)

		product.deactivate()
		expect(product.status).toBe(ProductStatus.INACTIVE)

		product.reactivate()
		expect(product.status).toBe(ProductStatus.ACTIVE)

		product.deactivate()
		product.archive()
		expect(product.status).toBe(ProductStatus.ARCHIVED)

		expect(() => product.publish()).toThrow(InvalidCatalogLifecycleTransitionError)
	})

	test('archived products can be restored back to draft', () => {
		const product = Product.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Racao Premium',
			slug: CatalogSlug.createFromText('Racao Premium'),
		})

		expect(() => product.restore()).toThrow(InvalidCatalogLifecycleTransitionError)

		product.archive()
		expect(product.status).toBe(ProductStatus.ARCHIVED)

		product.restore()
		expect(product.status).toBe(ProductStatus.DRAFT)

		product.publish()
		expect(product.status).toBe(ProductStatus.ACTIVE)
	})

	test('archived products reject further editorial edits', () => {
		const category = Category.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Caes',
			slug: CatalogSlug.create('caes'),
		})

		const product = Product.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Tapete Higienico',
			slug: CatalogSlug.create('tapete-higienico'),
		})

		product.archive()

		expect(() => product.updateDetails({ name: 'Tapete Higienico Super' })).toThrow(
			ArchivedCatalogEntityError,
		)
		expect(() =>
			product.assignCategories({
				primaryCategoryId: category.id,
				categories: [{ categoryId: category.id, status: category.status }],
			}),
		).toThrow(ArchivedCatalogEntityError)
	})

	test('product accepts multiple active categories while enforcing one primary category', () => {
		const storeId = new UniqueEntityID('store-1')
		const dogFood = Category.create({
			storeId,
			name: 'Racao',
			slug: CatalogSlug.create('racao'),
		})
		const premium = Category.create({
			storeId,
			name: 'Premium',
			slug: CatalogSlug.create('premium'),
		})
		const inactive = Category.create({
			storeId,
			name: 'Descontinuados',
			slug: CatalogSlug.create('descontinuados'),
			status: CategoryStatus.INACTIVE,
		})
		const product = Product.create({
			storeId,
			name: 'Racao Gatos Adultos',
			slug: CatalogSlug.create('racao-gatos-adultos'),
		})

		product.assignCategories({
			primaryCategoryId: dogFood.id,
			categories: [
				{ categoryId: dogFood.id, status: dogFood.status },
				{ categoryId: premium.id, status: premium.status },
			],
		})

		expect(product.primaryCategoryId?.toString()).toBe(dogFood.id.toString())
		expect(product.categoryIds.map((id) => id.toString())).toEqual([
			dogFood.id.toString(),
			premium.id.toString(),
		])

		expect(() =>
			product.assignCategories({
				primaryCategoryId: new UniqueEntityID('missing-category'),
				categories: [{ categoryId: dogFood.id, status: dogFood.status }],
			}),
		).toThrow(InvalidPrimaryCategoryError)

		expect(() =>
			product.assignCategories({
				primaryCategoryId: inactive.id,
				categories: [{ categoryId: inactive.id, status: inactive.status }],
			}),
		).toThrow(InactiveCategoryAssignmentError)
	})

	test('variant pricing invariants reject negative amounts', () => {
		expect(() =>
			ProductVariant.create({
				sku: Sku.create('SKU-001'),
				name: '10kg',
				price: Money.create(-1),
				attributes: { weight: '10kg' },
			}),
		).toThrow(InvalidVariantPricingError)

		expect(() =>
			ProductVariant.create({
				sku: Sku.create('SKU-002'),
				name: '20kg',
				price: Money.create(19990),
				cost: Money.create(-1),
				attributes: { weight: '20kg' },
			}),
		).toThrow(InvalidVariantPricingError)
	})

	test('variant keeps arbitrary attributes and independent commercial fields', () => {
		const variant = ProductVariant.create({
			sku: Sku.create('PET-ADULT-15KG'),
			name: '15kg',
			price: Money.create(24990),
			cost: Money.create(18990),
			attributes: {
				weight: '15kg',
				flavor: 'carne',
				lifeStage: 'adulto',
			},
		})

		expect(variant.sku.value).toBe('PET-ADULT-15KG')
		expect(variant.price.amountInCents).toBe(24990)
		expect(variant.cost?.amountInCents).toBe(18990)
		expect(variant.attributes).toEqual({
			weight: '15kg',
			flavor: 'carne',
			lifeStage: 'adulto',
		})
	})

	test('category home visibility defaults to true and can be toggled independently of status', () => {
		const category = Category.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Acessorios',
			slug: CatalogSlug.create('acessorios'),
		})

		expect(category.isVisibleOnHome).toBe(true)

		category.updateDetails({ isVisibleOnHome: false })
		expect(category.isVisibleOnHome).toBe(false)
		// Toggling visibility must not touch lifecycle status.
		expect(category.status).toBe(CategoryStatus.ACTIVE)

		category.updateDetails({ isVisibleOnHome: true })
		expect(category.isVisibleOnHome).toBe(true)

		const hiddenFromCreation = Category.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Rascunho',
			slug: CatalogSlug.create('rascunho'),
			isVisibleOnHome: false,
		})

		expect(hiddenFromCreation.isVisibleOnHome).toBe(false)
	})

	test('category slug is generated from parent slug and name, never user-supplied', () => {
		expect(generateCategorySlug('Cachorro')).toBe('cachorro')
		expect(generateCategorySlug('Ração', 'cachorro')).toBe('cachorro-racao')

		// Two children named identically under *different* parents must not collide —
		// this is the exact bug this generation scheme fixes.
		expect(generateCategorySlug('Ração', 'gato')).toBe('gato-racao')
		expect(generateCategorySlug('Ração', 'cachorro')).not.toBe(
			generateCategorySlug('Ração', 'gato'),
		)

		// Accents and other special characters are stripped, not percent-encoded.
		expect(generateCategorySlug('Ração')).toBe('racao')
		expect(generateCategorySlug('Açaí & Cia')).toBe('acai-cia')
	})

	test('variant SKU is generated deterministically from category, product, and sequence', () => {
		expect(
			generateVariantSku({
				categorySlug: 'cachorro-racao',
				productSlug: 'racao-premium-caes-adultos',
				sequence: 1,
			}),
		).toBe('CACH-RACAOP-01')

		// A second variant on the same product gets a distinct sequence suffix.
		expect(
			generateVariantSku({
				categorySlug: 'cachorro-racao',
				productSlug: 'racao-premium-caes-adultos',
				sequence: 2,
			}),
		).toBe('CACH-RACAOP-02')

		// No primary category falls back to a fixed code rather than crashing.
		expect(
			generateVariantSku({ categorySlug: null, productSlug: 'tapete-higienico', sequence: 1 }),
		).toBe('GEN-TAPETE-01')

		// Nothing here changes for the same inputs — deterministic, not random.
		expect(
			generateVariantSku({
				categorySlug: 'cachorro-racao',
				productSlug: 'racao-premium-caes-adultos',
				sequence: 1,
			}),
		).toBe('CACH-RACAOP-01')
	})

	test('category parenting seam rejects self cycles and descendant cycles', () => {
		const categoryId = new UniqueEntityID('category-1')

		expect(() =>
			ensureCategoryParentingIsAcyclic({
				categoryId,
				parentCategoryId: categoryId,
				ancestorCategoryIds: [],
			}),
		).toThrow(CategoryCycleError)

		expect(() =>
			ensureCategoryParentingIsAcyclic({
				categoryId,
				parentCategoryId: new UniqueEntityID('category-2'),
				ancestorCategoryIds: [new UniqueEntityID('category-3'), categoryId],
			}),
		).toThrow(CategoryCycleError)
	})

	test('product image collection keeps one primary image and persists explicit order', () => {
		const product = Product.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Racao Premium',
			slug: CatalogSlug.create('racao-premium'),
		})

		const secondary = ProductImage.create(
			{
				attachmentId: new UniqueEntityID('attachment-2'),
				url: 'https://cdn.example.com/products/racao-side.png',
				altText: 'Lateral',
				position: 10,
				isPrimary: false,
			},
			new UniqueEntityID('image-2'),
		)
		const primary = ProductImage.create(
			{
				attachmentId: new UniqueEntityID('attachment-1'),
				url: 'https://cdn.example.com/products/racao-front.png',
				altText: 'Frontal',
				position: 99,
				isPrimary: true,
			},
			new UniqueEntityID('image-1'),
		)

		product.replaceImages([secondary, primary])

		expect(product.images.map((image) => image.id.toString())).toEqual(['image-2', 'image-1'])
		expect(product.images.map((image) => image.position)).toEqual([0, 1])
		expect(
			product.images.filter((image) => image.isPrimary).map((image) => image.id.toString()),
		).toEqual(['image-1'])
	})

	test('product image collection rejects empty-primary and multi-primary states', () => {
		const product = Product.create({
			storeId: new UniqueEntityID('store-1'),
			name: 'Racao Premium',
			slug: CatalogSlug.create('racao-premium'),
		})

		expect(() =>
			product.replaceImages([
				ProductImage.create({
					attachmentId: new UniqueEntityID('attachment-1'),
					url: 'https://cdn.example.com/products/racao-front.png',
					position: 0,
					isPrimary: false,
				}),
			]),
		).toThrow(InvalidCatalogLifecycleTransitionError)

		expect(() =>
			product.replaceImages([
				ProductImage.create({
					attachmentId: new UniqueEntityID('attachment-1'),
					url: 'https://cdn.example.com/products/racao-front.png',
					position: 0,
					isPrimary: true,
				}),
				ProductImage.create({
					attachmentId: new UniqueEntityID('attachment-2'),
					url: 'https://cdn.example.com/products/racao-back.png',
					position: 1,
					isPrimary: true,
				}),
			]),
		).toThrow(InvalidCatalogLifecycleTransitionError)
	})
})
