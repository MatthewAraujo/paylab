/**
 * Deterministic, human-scannable variant SKU format:
 *
 *   <CATEGORY-CODE>-<PRODUCT-CODE>-<SEQUENCE>
 *
 * - CATEGORY-CODE: up to 4 alphanumeric chars from the product's primary category
 *   slug, uppercased (falls back to `GEN` when the product has no primary category).
 * - PRODUCT-CODE: up to 6 alphanumeric chars from the product's own slug, uppercased.
 * - SEQUENCE: the variant's 1-based ordinal on this product, zero-padded to 2 digits
 *   (e.g. `01`, `02`, ... `10`, `11`).
 *
 * Nothing here encodes a mutable field (price, name, attributes) — this becomes a
 * durable identifier once printed on labels/receipts, so only the product/category
 * identity and an ordinal feed the format. See T4.
 *
 * Example: category slug `cachorro-racao`, product slug `racao-premium-caes-adultos`,
 * sequence 1 -> `CACH-RACAOP-01`.
 */
export function generateVariantSku(input: {
	categorySlug?: string | null
	productSlug: string
	sequence: number
}): string {
	const categoryCode = buildSkuCode(input.categorySlug ?? 'GEN', 4)
	const productCode = buildSkuCode(input.productSlug, 6)
	const sequenceCode = String(input.sequence).padStart(2, '0')

	return `${categoryCode}-${productCode}-${sequenceCode}`
}

function buildSkuCode(slug: string, length: number): string {
	const alphanumeric = slug.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
	return alphanumeric.slice(0, length) || 'X'.repeat(length)
}
