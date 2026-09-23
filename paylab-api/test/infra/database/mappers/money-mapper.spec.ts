import {
	balanceToNumber,
	centavosToBigInt,
	centavosToNumber,
} from '@/infra/database/mappers/money-mapper'

describe('money mapper', () => {
	it('converts a database BigInt inside the safe range to a number', () => {
		expect(centavosToNumber(0n)).toBe(0)
		expect(centavosToNumber(12_345n)).toBe(12_345)
		expect(centavosToNumber(BigInt(Number.MAX_SAFE_INTEGER))).toBe(Number.MAX_SAFE_INTEGER)
	})

	it('rejects a database BigInt beyond the safe range instead of losing precision', () => {
		expect(() => centavosToNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toThrow(/safe/i)
		expect(() => centavosToNumber(-BigInt(Number.MAX_SAFE_INTEGER) - 1n)).toThrow(/safe/i)
	})

	it('converts a domain integer to a BigInt and rejects anything that is not a safe integer', () => {
		expect(centavosToBigInt(500)).toBe(500n)
		expect(() => centavosToBigInt(1.5)).toThrow(/safe integer/i)
		expect(() => centavosToBigInt(Number.MAX_SAFE_INTEGER + 1)).toThrow(/safe integer/i)
	})

	it('converts a Balance, which may be zero or negative for a clearing Account', () => {
		expect(balanceToNumber(0n)).toBe(0)
		expect(balanceToNumber(-250n)).toBe(-250)
	})
})
