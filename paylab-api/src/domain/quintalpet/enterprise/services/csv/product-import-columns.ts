/**
 * Canonical column list for the bulk product import CSV. Single source of truth:
 * the parser's header validation (T1) and the downloadable template (T5) both
 * read from here so they can never drift.
 *
 * Order matters only for the generated template — the parser maps by header
 * name, not position.
 *
 * Unknown columns are ignored, not rejected: a legacy CSV that still carries a
 * `compare_at_price` column (removed — markdown is a Promotion now, not a variant
 * field) imports fine, the extra column is simply skipped.
 */
export const PRODUCT_IMPORT_COLUMNS = [
	'product_slug',
	'product_name',
	'description',
	'brand',
	'primary_category',
	'subcategory',
	'variant_name',
	'sku',
	'price',
	'cost',
	'barcode',
	'weight',
	'initial_stock',
] as const

export type ProductImportColumn = (typeof PRODUCT_IMPORT_COLUMNS)[number]

/**
 * Columns that must carry a value on the rows that need them:
 * - `product_slug`, `variant_name`, `price` on every data row;
 * - `product_name` on at least the first row of each `product_slug` group.
 */
export const REQUIRED_PRODUCT_IMPORT_COLUMNS = [
	'product_slug',
	'product_name',
	'variant_name',
	'price',
] as const
