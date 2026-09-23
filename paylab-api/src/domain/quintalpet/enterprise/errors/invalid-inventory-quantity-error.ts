export class InvalidInventoryQuantityError extends Error {
	constructor() {
		super('Inventory movements require a non-zero positive quantity.')
	}
}
