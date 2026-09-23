import { Prisma } from '@prisma/client'
import { Category } from '../../enterprise/entities/category'
import { CatalogSlug } from '../../enterprise/value-objects/slug'

export abstract class CatalogCategoriesRepository {
	abstract findById(id: string, storeId: string): Promise<Category | null>
	abstract findBySlug(slug: CatalogSlug, storeId: string): Promise<Category | null>
	abstract listAncestorIds(id: string, storeId: string): Promise<string[]>
	/**
	 * The full descendant subtree of `id` (children, grandchildren, …), excluding
	 * `id` itself. Store-scoped and deterministic (breadth-first, ordered by id).
	 * Used by the promotion engine to expand a `CATEGORY` condition to its subtree
	 * (CONTEXT "Category Promotion Descendants").
	 */
	abstract listDescendantIds(id: string, storeId: string): Promise<string[]>
	abstract save(category: Category, tx?: Prisma.TransactionClient): Promise<void>
}
