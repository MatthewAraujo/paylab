export class CatalogSlug {
	constructor(readonly value: string) {}

	static create(value: string) {
		return new CatalogSlug(value)
	}

	static createFromText(text: string) {
		const slugText = text
			.normalize('NFKD')
			.toLowerCase()
			.trim()
			.replace(/\s+/g, '-')
			.replace(/[^\w-]+/g, '')
			.replace(/_/g, '-')
			.replace(/--+/g, '-')
			.replace(/-$/g, '')

		return new CatalogSlug(slugText)
	}
}
