import { Either, left, right } from '@/core/either'
import { ValueObject } from '@/core/entities/value-object'
import { InvalidAmountError } from '../../errors/invalid-amount-error'

/**
 * A positive monetary value in the smallest currency unit (centavos for BRL).
 *
 * Internal type: a JavaScript `number` restricted to safe integers (<= 2^53 - 1,
 * about 90 trillion BRL). Floats are never accepted. The database stores 64-bit
 * integers; converting to and from `bigint` happens only in the infra mapper.
 * (ValueObject.equals is overridden because JSON.stringify cannot serialize bigint.)
 */
interface AmountProps {
	centavos: number
}

export class Amount extends ValueObject<AmountProps> {
	static create(centavos: number): Either<InvalidAmountError, Amount> {
		if (typeof centavos !== 'number' || !Number.isSafeInteger(centavos)) {
			return left(new InvalidAmountError('Amount must be a safe integer number of centavos'))
		}

		if (centavos <= 0) {
			return left(new InvalidAmountError('Amount must be greater than zero'))
		}

		return right(new Amount({ centavos }))
	}

	toNumber(): number {
		return this.props.centavos
	}

	add(other: Amount): Either<InvalidAmountError, Amount> {
		return Amount.create(this.props.centavos + other.props.centavos)
	}

	isGreaterThan(other: Amount): boolean {
		return this.props.centavos > other.props.centavos
	}

	override equals(other: ValueObject<unknown>): boolean {
		return other instanceof Amount && other.props.centavos === this.props.centavos
	}
}
