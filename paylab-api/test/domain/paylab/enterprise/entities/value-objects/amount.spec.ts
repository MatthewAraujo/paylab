import { Amount } from '@/domain/paylab/enterprise/entities/value-objects/amount'
import { InvalidAmountError } from '@/domain/paylab/enterprise/errors/invalid-amount-error'

describe('Amount', () => {
	it('is created from an integer number of centavos', () => {
		const result = Amount.create(1050)

		expect(result.isRight()).toBe(true)
		expect((result.value as Amount).toNumber()).toBe(1050)
	})

	it.each([0, -1, 10.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
		'rejects %s',
		(input) => {
			const result = Amount.create(input)

			expect(result.isLeft()).toBe(true)
			expect(result.value).toBeInstanceOf(InvalidAmountError)
		},
	)

	it('accepts the largest safe integer', () => {
		expect(Amount.create(Number.MAX_SAFE_INTEGER).isRight()).toBe(true)
	})

	it('adds two amounts', () => {
		const a = Amount.create(100).value as Amount
		const b = Amount.create(250).value as Amount

		const sum = a.add(b)

		expect(sum.isRight()).toBe(true)
		expect((sum.value as Amount).toNumber()).toBe(350)
	})

	it('rejects a sum beyond the safe range', () => {
		const max = Amount.create(Number.MAX_SAFE_INTEGER).value as Amount
		const one = Amount.create(1).value as Amount

		expect(max.add(one).isLeft()).toBe(true)
	})

	it('compares amounts', () => {
		const small = Amount.create(100).value as Amount
		const same = Amount.create(100).value as Amount
		const big = Amount.create(200).value as Amount

		expect(small.equals(same)).toBe(true)
		expect(small.equals(big)).toBe(false)
		expect(big.isGreaterThan(small)).toBe(true)
		expect(small.isGreaterThan(big)).toBe(false)
		expect(small.isGreaterThan(same)).toBe(false)
	})
})
