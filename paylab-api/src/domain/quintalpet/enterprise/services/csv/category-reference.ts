export function parseCategoryReference(raw: string): string[] {
	return raw
		.split('>')
		.map((segment) => segment.trim())
		.filter((segment) => segment.length > 0)
}

export function normalizeName(raw: string): string {
	return raw.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replace(/\s+/g, ' ')
}
