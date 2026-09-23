export class Money {
	private constructor(readonly amountInCents: number) {}

	static create(amountInCents: number) {
		return new Money(amountInCents)
	}
}
