import { CatalogSlug } from '../value-objects/slug'

/**
 * Builds the deterministic base slug for a category from its name and, when it has
 * one, its parent's slug — e.g. parent `cachorro`, name `Ração` -> `cachorro-racao`.
 * A root category (no parent) just gets its own slugified name.
 *
 * This is the base slug only: callers are responsible for resolving collisions
 * against already-persisted slugs (see `ManageCatalogUseCase`'s uniqueness loop),
 * since uniqueness is a per-store, storage-backed concern this pure function has no
 * access to.
 */
export function generateCategorySlug(name: string, parentSlug?: string | null): string {
	const nameSlug = CatalogSlug.createFromText(name).value

	return parentSlug ? `${parentSlug}-${nameSlug}` : nameSlug
}
