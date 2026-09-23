export class ArchivedCatalogEntityError extends Error {
	constructor() {
		super('Archived catalog entities cannot be edited.')
	}
}
