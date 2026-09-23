export class Sku {
	private constructor(readonly value: string) {}

	static create(value: string) {
		return new Sku(value.trim().toUpperCase())
	}
}
