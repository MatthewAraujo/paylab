import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable, NotFoundException } from '@nestjs/common'
import {
	CatalogBrandStatus,
	CatalogCategoryStatus,
	CatalogProductStatus,
	CatalogVariantStatus,
} from '@prisma/client'

type StoreSummary = {
	id: string
	slug: string
}

/**
 * Storefront listing surfaces only show a product that is currently buyable:
 * at least one `ACTIVE` variant with an `InventoryItem` whose `availableQuantity`
 * is greater than zero. A variant with no `InventoryItem` row counts as zero, and
 * a product with zero `ACTIVE` variants is not visible. This is the query-time
 * counterpart of the in-memory `computeInStock` helper. See ADR 0006.
 *
 * Product publication *status* is untouched by this rule — it is purely editorial.
 */
const STOREFRONT_STOCK_VARIANT_FILTER = {
	some: {
		status: CatalogVariantStatus.ACTIVE,
		inventoryItem: { is: { availableQuantity: { gt: 0 } } },
	},
} as const

/** True when `variants` contains at least one sellable (in-stock) entry. */
export function hasSellableStock(
	variants: Array<{ inventoryItem: { availableQuantity: number } | null }>,
): boolean {
	return variants.some((variant) => (variant.inventoryItem?.availableQuantity ?? 0) > 0)
}

type ProductListFilters = {
	storeSlug?: string
	categorySlug?: string
	brandSlug?: string
	searchTerm?: string
	page: number
	limit: number
}

@Injectable()
export class QueryStorefrontUseCase {
	constructor(private readonly prisma: PrismaService) {}

	private normalizeVariantAttributes(attributes: unknown): Record<string, string> {
		if (!attributes || typeof attributes !== 'object' || Array.isArray(attributes)) {
			return {}
		}

		return Object.fromEntries(
			Object.entries(attributes).flatMap(([key, value]) =>
				typeof value === 'string' && value.length > 0 ? [[key, value]] : [],
			),
		)
	}

	async getHome(storeSlug?: string) {
		const store = await this.resolveStore(storeSlug)
		const [rootCategories, featuredCategories, featuredProducts] = await Promise.all([
			this.prisma.category.findMany({
				where: {
					storeId: store.id,
					parentCategoryId: null,
					status: CatalogCategoryStatus.ACTIVE,
					// Only show a department for a root category the operator explicitly
					// marked visible — an active root with the flag off must not appear at
					// all, not even as an empty department. See T3.
					isVisibleOnHome: true,
				},
				orderBy: { slug: 'asc' },
				select: { id: true, name: true, slug: true, imageUrl: true },
			}),
			this.prisma.merchandisingFeaturedCategory.findMany({
				where: {
					storeId: store.id,
					// In addition to (not instead of) the merchandising feature itself:
					// a hidden child never shows even if curated, and a hidden root's
					// self-featured entry never shows either.
					category: { status: CatalogCategoryStatus.ACTIVE, isVisibleOnHome: true },
				},
				orderBy: { position: 'asc' },
				include: {
					category: {
						select: {
							name: true,
							slug: true,
							imageUrl: true,
							parentCategoryId: true,
						},
					},
				},
			}),
			this.prisma.merchandisingFeaturedProduct.findMany({
				where: {
					storeId: store.id,
					product: { status: CatalogProductStatus.ACTIVE },
				},
				orderBy: { position: 'asc' },
				include: {
					product: {
						include: {
							brand: true,
							images: { orderBy: { position: 'asc' } },
							variants: {
								where: { status: CatalogVariantStatus.ACTIVE },
								include: { inventoryItem: true },
								orderBy: { createdAt: 'asc' },
							},
						},
					},
				},
			}),
		])

		// A featured category belongs to whichever root category is its parent
		// (or to itself, if it has no parent). This is how the storefront
		// derives "departments" without any hardcoded list — adding a new one
		// is just creating another root category.
		const featuredByDepartmentId = new Map<
			string,
			Array<{ categoryId: string; name: string; slug: string; imageUrl: string | null }>
		>()

		for (const reference of featuredCategories) {
			const departmentId = reference.category.parentCategoryId ?? reference.categoryId
			const bucket = featuredByDepartmentId.get(departmentId) ?? []

			bucket.push({
				categoryId: reference.categoryId,
				name: reference.category.name,
				slug: reference.category.slug,
				imageUrl: reference.category.imageUrl,
			})
			featuredByDepartmentId.set(departmentId, bucket)
		}

		return {
			featuredCategories: rootCategories.map((department) => ({
				departmentId: department.id,
				name: department.name,
				slug: department.slug,
				imageUrl: department.imageUrl,
				categories: featuredByDepartmentId.get(department.id) ?? [],
			})),
			featuredProducts: featuredProducts
				// A featured reference to a fully out-of-stock ACTIVE product is
				// dropped from the home feed (its variants are already restricted to
				// ACTIVE in the query above). Featured *categories* and departments
				// are unaffected. See ADR 0006.
				.filter((reference) => hasSellableStock(reference.product.variants))
				.map((reference) => ({
					productId: reference.productId,
					...this.presentHomeFeaturedProduct(reference.product),
				})),
		}
	}

	async listProducts(filters: ProductListFilters) {
		const store = await this.resolveStore(filters.storeSlug)
		const where = {
			storeId: store.id,
			status: CatalogProductStatus.ACTIVE,
			brand:
				filters.brandSlug !== undefined
					? {
							is: {
								slug: filters.brandSlug,
								status: CatalogBrandStatus.ACTIVE,
							},
						}
					: undefined,
			categories:
				filters.categorySlug !== undefined
					? {
							some: {
								category: {
									slug: filters.categorySlug,
									status: CatalogCategoryStatus.ACTIVE,
								},
							},
						}
					: undefined,
			name:
				filters.searchTerm !== undefined
					? {
							contains: filters.searchTerm,
							mode: 'insensitive' as const,
						}
					: undefined,
			// Hide fully out-of-stock ACTIVE products from every listing surface.
			// The same `where` feeds both `findMany` and `count`, so pagination
			// totals stay consistent with the filtered page. See ADR 0006.
			variants: STOREFRONT_STOCK_VARIANT_FILTER,
		}

		const [items, total] = await Promise.all([
			this.prisma.product.findMany({
				where,
				include: {
					brand: true,
					primaryCategory: true,
					images: { orderBy: { position: 'asc' } },
					variants: {
						where: { status: CatalogVariantStatus.ACTIVE },
						include: { inventoryItem: true },
						orderBy: { createdAt: 'asc' },
					},
				},
				orderBy: { createdAt: 'asc' },
				skip: (filters.page - 1) * filters.limit,
				take: filters.limit,
			}),
			this.prisma.product.count({ where }),
		])

		return {
			items: items.map((product) => this.presentProductCard(product)),
			pagination: {
				page: filters.page,
				limit: filters.limit,
				total,
				totalPages: Math.max(1, Math.ceil(total / filters.limit)),
			},
		}
	}

	async getProductBySlug(slug: string, storeSlug?: string) {
		const store = await this.resolveStore(storeSlug)
		const product = await this.prisma.product.findFirst({
			where: {
				storeId: store.id,
				slug,
				status: CatalogProductStatus.ACTIVE,
			},
			include: {
				brand: true,
				primaryCategory: true,
				categories: {
					include: {
						category: true,
					},
					orderBy: { createdAt: 'asc' },
				},
				images: { orderBy: { position: 'asc' } },
				variants: {
					where: { status: CatalogVariantStatus.ACTIVE },
					include: { inventoryItem: true },
					orderBy: { createdAt: 'asc' },
				},
			},
		})

		if (!product) {
			throw new NotFoundException('Storefront product not found.')
		}

		const priceRange = this.computePriceRange(product.variants)
		const inStock = this.computeInStock(product.variants)
		const primaryCategoryPath = product.primaryCategoryId
			? await this.buildCategoryBreadcrumb(product.primaryCategoryId, store.id)
			: []

		return {
			name: product.name,
			slug: product.slug,
			description: product.description,
			brand: this.presentBrand(product.brand),
			primaryCategory: this.presentCategorySummary(product.primaryCategory),
			categories: product.categories
				.filter((entry) => entry.category.status === CatalogCategoryStatus.ACTIVE)
				.map((entry) => this.presentCategorySummary(entry.category))
				.filter((category): category is { name: string; slug: string } => category !== null)
				.sort((a, b) => a.name.localeCompare(b.name)),
			images: product.images.map((image) => ({
				url: image.url,
				altText: image.altText,
				isPrimary: image.isPrimary,
			})),
			variants: product.variants.map((variant) => ({
				id: variant.id,
				name: variant.name,
				priceCents: variant.priceCents,
				attributes: variant.attributes as Record<string, string>,
				availableQuantity: variant.inventoryItem?.availableQuantity ?? 0,
				inStock: (variant.inventoryItem?.availableQuantity ?? 0) > 0,
			})),
			primaryCategoryPath,
			priceRange,
			inStock,
		}
	}

	async listCategories(storeSlug?: string) {
		const store = await this.resolveStore(storeSlug)
		const categories = await this.prisma.category.findMany({
			where: {
				storeId: store.id,
				status: CatalogCategoryStatus.ACTIVE,
			},
			include: {
				parentCategory: true,
			},
		})

		const sortedCategories = [...categories].sort((left, right) => {
			const leftDepth = left.parentCategoryId ? 1 : 0
			const rightDepth = right.parentCategoryId ? 1 : 0

			if (leftDepth !== rightDepth) {
				return leftDepth - rightDepth
			}

			const parentSlugComparison = (left.parentCategory?.slug ?? '').localeCompare(
				right.parentCategory?.slug ?? '',
			)

			if (parentSlugComparison !== 0) {
				return parentSlugComparison
			}

			return left.name.localeCompare(right.name)
		})

		return {
			items: sortedCategories.map((category) => ({
				name: category.name,
				slug: category.slug,
				imageUrl: category.imageUrl,
				isVisibleOnHome: category.isVisibleOnHome,
				parentSlug:
					category.parentCategory?.status === CatalogCategoryStatus.ACTIVE
						? category.parentCategory.slug
						: null,
			})),
		}
	}

	async getCategoryBySlug(slug: string, storeSlug?: string) {
		const store = await this.resolveStore(storeSlug)
		const category = await this.prisma.category.findFirst({
			where: {
				storeId: store.id,
				slug,
				status: CatalogCategoryStatus.ACTIVE,
			},
			include: {
				parentCategory: true,
				childCategories: {
					where: { status: CatalogCategoryStatus.ACTIVE },
					orderBy: { createdAt: 'asc' },
				},
			},
		})

		if (!category) {
			throw new NotFoundException('Storefront category not found.')
		}

		const breadcrumb = await this.buildCategoryBreadcrumb(category.id, store.id)

		return {
			name: category.name,
			slug: category.slug,
			imageUrl: category.imageUrl,
			parentCategory:
				category.parentCategory?.status === CatalogCategoryStatus.ACTIVE
					? {
							name: category.parentCategory.name,
							slug: category.parentCategory.slug,
						}
					: null,
			breadcrumb,
			childCategories: category.childCategories.map((childCategory) => ({
				name: childCategory.name,
				slug: childCategory.slug,
				imageUrl: childCategory.imageUrl,
			})),
		}
	}

	async listBrands(storeSlug?: string) {
		const store = await this.resolveStore(storeSlug)
		const brands = await this.prisma.brand.findMany({
			where: {
				storeId: store.id,
				status: CatalogBrandStatus.ACTIVE,
				// A brand is listed only when it still has at least one buyable
				// (in-stock) ACTIVE product, so following a brand link never lands
				// on an empty page. See ADR 0006.
				products: {
					some: {
						status: CatalogProductStatus.ACTIVE,
						variants: STOREFRONT_STOCK_VARIANT_FILTER,
					},
				},
			},
			orderBy: { createdAt: 'asc' },
		})

		return {
			items: brands.map((brand) => ({
				name: brand.name,
				slug: brand.slug,
				logoUrl: brand.logoUrl,
			})),
		}
	}

	async searchCatalog(filters: ProductListFilters & { searchTerm: string }) {
		return this.listProducts(filters)
	}

	private async resolveStore(storeSlug?: string): Promise<StoreSummary> {
		if (storeSlug) {
			const store = await this.prisma.store.findUnique({
				where: { slug: storeSlug },
				select: { id: true, slug: true },
			})

			if (!store) {
				throw new NotFoundException('Store not found.')
			}

			return store
		}

		const stores = await this.prisma.store.findMany({
			select: { id: true, slug: true },
			orderBy: { createdAt: 'asc' },
			take: 2,
		})

		if (stores.length === 1) {
			return stores[0]
		}

		throw new NotFoundException('Store not found.')
	}

	private presentProductCard(product: {
		name: string
		slug: string
		description: string | null
		brand: {
			name: string
			slug: string
			logoUrl: string | null
			status?: CatalogBrandStatus
		} | null
		primaryCategory: { name: string; slug: string; status?: CatalogCategoryStatus } | null
		images: Array<{ url: string; altText: string | null; isPrimary: boolean }>
		variants: Array<{
			id: string
			name: string
			priceCents: number
			attributes: unknown
			inventoryItem: { availableQuantity: number } | null
		}>
	}) {
		return {
			name: product.name,
			slug: product.slug,
			description: product.description,
			brand: this.presentBrand(product.brand),
			primaryCategory: this.presentCategorySummary(product.primaryCategory),
			primaryImage: this.presentPrimaryImage(product.images),
			priceRange: this.computePriceRange(product.variants),
			inStock: this.computeInStock(product.variants),
			variants: product.variants.map((variant) => ({
				id: variant.id,
				name: variant.name,
				priceCents: variant.priceCents,
				attributes: this.normalizeVariantAttributes(variant.attributes),
				availableQuantity: variant.inventoryItem?.availableQuantity ?? 0,
				inStock: (variant.inventoryItem?.availableQuantity ?? 0) > 0,
			})),
		}
	}

	private presentHomeFeaturedProduct(product: {
		name: string
		slug: string
		description: string | null
		brand: {
			name: string
			slug: string
			logoUrl: string | null
			status?: CatalogBrandStatus
		} | null
		images: Array<{ url: string; altText: string | null; isPrimary: boolean }>
		variants: Array<{ priceCents: number; inventoryItem: { availableQuantity: number } | null }>
	}) {
		return {
			name: product.name,
			slug: product.slug,
			description: product.description,
			brand: this.presentBrand(product.brand),
			primaryImage: this.presentPrimaryImage(product.images),
			priceRange: this.computePriceRange(product.variants),
			inStock: this.computeInStock(product.variants),
		}
	}

	private presentBrand(
		brand: {
			name: string
			slug: string
			logoUrl: string | null
			status?: CatalogBrandStatus
		} | null,
	) {
		if (!brand || (brand.status !== undefined && brand.status !== CatalogBrandStatus.ACTIVE)) {
			return null
		}

		return {
			name: brand.name,
			slug: brand.slug,
			logoUrl: brand.logoUrl,
		}
	}

	private presentCategorySummary(
		category: { name: string; slug: string; status?: CatalogCategoryStatus } | null,
	) {
		if (
			!category ||
			(category.status !== undefined && category.status !== CatalogCategoryStatus.ACTIVE)
		) {
			return null
		}

		return {
			name: category.name,
			slug: category.slug,
		}
	}

	private presentPrimaryImage(
		images: Array<{ url: string; altText: string | null; isPrimary: boolean }>,
	) {
		const image = images.find((item) => item.isPrimary) ?? images[0]

		if (!image) {
			return null
		}

		return {
			url: image.url,
			altText: image.altText,
		}
	}

	private computePriceRange(variants: Array<{ priceCents: number }>) {
		if (variants.length === 0) {
			return {
				minPriceCents: null,
				maxPriceCents: null,
			}
		}

		const prices = variants.map((variant) => variant.priceCents)

		return {
			minPriceCents: Math.min(...prices),
			maxPriceCents: Math.max(...prices),
		}
	}

	private computeInStock(variants: Array<{ inventoryItem: { availableQuantity: number } | null }>) {
		return hasSellableStock(variants)
	}

	private async buildCategoryBreadcrumb(categoryId: string, storeId: string) {
		const breadcrumb: Array<{ name: string; slug: string }> = []
		let currentCategoryId: string | null = categoryId

		while (currentCategoryId) {
			const category = await this.prisma.category.findFirst({
				where: {
					id: currentCategoryId,
					storeId: storeId,
					status: CatalogCategoryStatus.ACTIVE,
				},
				select: {
					id: true,
					name: true,
					slug: true,
					parentCategoryId: true,
				},
			})

			if (!category) {
				break
			}

			breadcrumb.unshift({
				name: category.name,
				slug: category.slug,
			})

			currentCategoryId = category.parentCategoryId
		}

		return breadcrumb
	}
}
