export interface StoreSummary {
	id: string
	name: string
	slug: string
	timezone: string
}

export abstract class StoresRepository {
	abstract findById(id: string): Promise<StoreSummary | null>
	abstract findBySlug(slug: string): Promise<StoreSummary | null>
}
