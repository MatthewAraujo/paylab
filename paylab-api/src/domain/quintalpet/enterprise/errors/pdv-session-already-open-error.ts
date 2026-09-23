export class PdvSessionAlreadyOpenError extends Error {
	constructor() {
		super('A PDV session is already open for this store today.')
	}
}
