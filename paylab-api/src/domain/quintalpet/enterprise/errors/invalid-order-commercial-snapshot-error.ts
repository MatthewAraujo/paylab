export class InvalidOrderCommercialSnapshotError extends Error {
	constructor(detail: string) {
		super(`The order commercial snapshot is inconsistent: ${detail}`)
	}
}
