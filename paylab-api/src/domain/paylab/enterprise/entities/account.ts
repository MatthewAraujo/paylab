import { Either, left, right } from '@/core/either'
import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InvalidAccountError } from '../errors/invalid-account-error'
import { UnsupportedCurrencyError } from '../errors/unsupported-currency-error'

export type AccountKind = 'WALLET' | 'EXTERNAL_CLEARING'

/** September operates in BRL only. */
export const SUPPORTED_CURRENCY = 'BRL'

export interface AccountProps {
	kind: AccountKind
	merchantId?: string
	currency: string
}

export class Account extends Entity<AccountProps> {
	get kind() {
		return this.props.kind
	}

	get merchantId() {
		return this.props.merchantId
	}

	get currency() {
		return this.props.currency
	}

	isWallet(): boolean {
		return this.props.kind === 'WALLET'
	}

	/** Validating factory for new Accounts. */
	static create(
		props: AccountProps,
		id?: UniqueEntityID,
	): Either<InvalidAccountError | UnsupportedCurrencyError, Account> {
		if (props.currency !== SUPPORTED_CURRENCY) {
			return left(new UnsupportedCurrencyError(props.currency))
		}

		if (props.kind === 'WALLET' && !props.merchantId) {
			return left(new InvalidAccountError('A Wallet must belong to a Merchant'))
		}

		if (props.kind === 'EXTERNAL_CLEARING' && props.merchantId) {
			return left(new InvalidAccountError('An External Clearing Account has no Merchant'))
		}

		return right(new Account(props, id))
	}

	/** Rebuilds an already-persisted Account without re-validating (used by repositories). */
	static restore(props: AccountProps, id?: UniqueEntityID): Account {
		return new Account(props, id)
	}
}
