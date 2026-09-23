// The single place where PostgreSQL 64-bit integers (Prisma BigInt) meet the
// domain's safe-integer numbers. Money is BIGINT centavos in the database and a
// safe-integer `number` in the domain (see Amount); nothing else converts.

export function centavosToNumber(value: bigint): number {
	if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < BigInt(Number.MIN_SAFE_INTEGER)) {
		throw new RangeError(`Value ${value} is outside the safe integer range`)
	}

	return Number(value)
}

export function centavosToBigInt(value: number): bigint {
	if (!Number.isSafeInteger(value)) {
		throw new RangeError(`Value ${value} is not a safe integer`)
	}

	return BigInt(value)
}

/** A Balance can be zero, and negative for the External Clearing Account. */
export function balanceToNumber(value: bigint): number {
	return centavosToNumber(value)
}
