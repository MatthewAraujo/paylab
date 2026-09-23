export class NegativeInventoryBalanceError extends Error {
	constructor() {
		super('Inventory balance cannot become negative.')
	}
}
