import { Either, left, right } from '@/core/either'
import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InvalidPaymentError } from '../errors/invalid-payment-error'
import { InvalidPaymentTransitionError } from '../errors/invalid-payment-transition-error'
import { Account, AccountKind } from './account'
import { Amount } from './value-objects/amount'

export type PaymentStatus = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'

/** INSUFFICIENT_FUNDS is the only failure reason in September. */
export type PaymentFailureReason = 'INSUFFICIENT_FUNDS'

export interface PaymentProps {
	merchantId: string
	sourceAccountId: UniqueEntityID
	sourceAccountKind: AccountKind
	destinationAccountId: UniqueEntityID
	amount: Amount
	currency: string
	status: PaymentStatus
	failureReason?: PaymentFailureReason
	idempotencyKey: string
	requestFingerprint: string
	ledgerTransactionId?: UniqueEntityID
	createdAt: Date
	updatedAt: Date
}

export interface CreatePaymentInput {
	merchantId: string
	source: Account
	destination: Account
	amount: Amount
	idempotencyKey: string
	requestFingerprint: string
}

export class Payment extends AggregateRoot<PaymentProps> {
	get merchantId() {
		return this.props.merchantId
	}

	get sourceAccountId() {
		return this.props.sourceAccountId
	}

	get destinationAccountId() {
		return this.props.destinationAccountId
	}

	get amount() {
		return this.props.amount
	}

	get currency() {
		return this.props.currency
	}

	get status() {
		return this.props.status
	}

	get failureReason() {
		return this.props.failureReason
	}

	get idempotencyKey() {
		return this.props.idempotencyKey
	}

	get requestFingerprint() {
		return this.props.requestFingerprint
	}

	get ledgerTransactionId() {
		return this.props.ledgerTransactionId
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt
	}

	/** Only a Payment sourced from a Wallet must prove sufficient funds at Settlement. */
	isBalanceConsumer(): boolean {
		return this.props.sourceAccountKind === 'WALLET'
	}

	static create(input: CreatePaymentInput): Either<InvalidPaymentError, Payment> {
		const { source, destination } = input

		if (source.id.equals(destination.id)) {
			return left(new InvalidPaymentError('Source and destination must differ'))
		}

		if (source.currency !== destination.currency) {
			return left(new InvalidPaymentError('Source and destination currencies must match'))
		}

		const now = new Date()

		return right(
			new Payment({
				merchantId: input.merchantId,
				sourceAccountId: source.id,
				sourceAccountKind: source.kind,
				destinationAccountId: destination.id,
				amount: input.amount,
				currency: source.currency,
				status: 'CREATED',
				idempotencyKey: input.idempotencyKey,
				requestFingerprint: input.requestFingerprint,
				createdAt: now,
				updatedAt: now,
			}),
		)
	}

	/** Rebuilds an already-persisted Payment without re-validating (used by repositories). */
	static restore(props: PaymentProps, id?: UniqueEntityID): Payment {
		return new Payment(props, id)
	}

	startProcessing(): Either<InvalidPaymentTransitionError, void> {
		return this.transition('CREATED', 'PROCESSING')
	}

	succeed(ledgerTransactionId?: UniqueEntityID): Either<InvalidPaymentTransitionError, void> {
		const result = this.transition('PROCESSING', 'SUCCEEDED')
		if (result.isRight()) {
			this.props.ledgerTransactionId = ledgerTransactionId
		}
		return result
	}

	fail(reason: PaymentFailureReason): Either<InvalidPaymentTransitionError, void> {
		const result = this.transition('PROCESSING', 'FAILED')
		if (result.isRight()) {
			this.props.failureReason = reason
		}
		return result
	}

	private transition(
		from: PaymentStatus,
		to: PaymentStatus,
	): Either<InvalidPaymentTransitionError, void> {
		if (this.props.status !== from) {
			return left(new InvalidPaymentTransitionError(this.props.status, to))
		}

		this.props.status = to
		this.props.updatedAt = new Date()
		return right(undefined)
	}
}
