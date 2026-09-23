import { Account } from '@/domain/paylab/enterprise/entities/account'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { Amount } from '@/domain/paylab/enterprise/entities/value-objects/amount'
import { InvalidPaymentError } from '@/domain/paylab/enterprise/errors/invalid-payment-error'
import { InvalidPaymentTransitionError } from '@/domain/paylab/enterprise/errors/invalid-payment-transition-error'

const wallet = (merchantId = 'merchant-1') =>
	Account.create({ kind: 'WALLET', merchantId, currency: 'BRL' }).value as Account
const clearing = () =>
	Account.create({ kind: 'EXTERNAL_CLEARING', currency: 'BRL' }).value as Account
const amount = (n = 1000) => Amount.create(n).value as Amount

function newPayment(source: Account = wallet(), destination: Account = wallet('merchant-2')) {
	const result = Payment.create({
		merchantId: 'merchant-1',
		source,
		destination,
		amount: amount(),
		idempotencyKey: 'key-1',
		requestFingerprint: 'fp-1',
	})
	return result.value as Payment
}

describe('Payment creation', () => {
	it('accepts a valid pair and starts CREATED', () => {
		const source = wallet()
		const destination = wallet('merchant-2')
		const payment = newPayment(source, destination)

		expect(payment.status).toBe('CREATED')
		expect(payment.sourceAccountId.equals(source.id)).toBe(true)
		expect(payment.destinationAccountId.equals(destination.id)).toBe(true)
		expect(payment.currency).toBe('BRL')
		expect(payment.amount.toNumber()).toBe(1000)
		expect(payment.failureReason).toBeUndefined()
	})

	it('rejects the same source and destination', () => {
		const account = wallet()

		const result = Payment.create({
			merchantId: 'merchant-1',
			source: account,
			destination: account,
			amount: amount(),
			idempotencyKey: 'key-1',
			requestFingerprint: 'fp-1',
		})

		expect(result.value).toBeInstanceOf(InvalidPaymentError)
	})

	it('rejects mismatched currencies', () => {
		// Account.create only allows BRL, so build the mismatch through the persistence path.
		const source = wallet()
		const other = Account.restore({
			kind: 'WALLET',
			merchantId: 'merchant-2',
			currency: 'USD',
		})

		const result = Payment.create({
			merchantId: 'merchant-1',
			source,
			destination: other,
			amount: amount(),
			idempotencyKey: 'key-1',
			requestFingerprint: 'fp-1',
		})

		expect(result.value).toBeInstanceOf(InvalidPaymentError)
	})

	it('cannot be built with a non-positive Amount', () => {
		expect(Amount.create(0).isLeft()).toBe(true)
		expect(Amount.create(-5).isLeft()).toBe(true)
	})
})

describe('Payment state machine', () => {
	it('CREATED -> PROCESSING -> SUCCEEDED', () => {
		const payment = newPayment()

		expect(payment.startProcessing().isRight()).toBe(true)
		expect(payment.status).toBe('PROCESSING')
		expect(payment.succeed().isRight()).toBe(true)
		expect(payment.status).toBe('SUCCEEDED')
	})

	it('PROCESSING -> FAILED carries a reason', () => {
		const payment = newPayment()
		payment.startProcessing()

		expect(payment.fail('INSUFFICIENT_FUNDS').isRight()).toBe(true)
		expect(payment.status).toBe('FAILED')
		expect(payment.failureReason).toBe('INSUFFICIENT_FUNDS')
	})

	it('rejects every other transition and leaves the state untouched', () => {
		const created = newPayment()
		expect(created.succeed().value).toBeInstanceOf(InvalidPaymentTransitionError)
		expect(created.fail('INSUFFICIENT_FUNDS').isLeft()).toBe(true)
		expect(created.status).toBe('CREATED')

		const processing = newPayment()
		processing.startProcessing()
		expect(processing.startProcessing().isLeft()).toBe(true)
		expect(processing.status).toBe('PROCESSING')
	})

	it('allows no transition out of SUCCEEDED', () => {
		const payment = newPayment()
		payment.startProcessing()
		payment.succeed()

		expect(payment.startProcessing().isLeft()).toBe(true)
		expect(payment.succeed().isLeft()).toBe(true)
		expect(payment.fail('INSUFFICIENT_FUNDS').isLeft()).toBe(true)
		expect(payment.status).toBe('SUCCEEDED')
	})

	it('allows no transition out of FAILED', () => {
		const payment = newPayment()
		payment.startProcessing()
		payment.fail('INSUFFICIENT_FUNDS')

		expect(payment.startProcessing().isLeft()).toBe(true)
		expect(payment.succeed().isLeft()).toBe(true)
		expect(payment.fail('INSUFFICIENT_FUNDS').isLeft()).toBe(true)
		expect(payment.status).toBe('FAILED')
		expect(payment.failureReason).toBe('INSUFFICIENT_FUNDS')
	})
})

describe('Balance Consumer', () => {
	it('is a Balance Consumer when the source is a Wallet', () => {
		expect(newPayment(wallet(), wallet('merchant-2')).isBalanceConsumer()).toBe(true)
	})

	it('is not a Balance Consumer when the source is the External Clearing Account', () => {
		expect(newPayment(clearing(), wallet()).isBalanceConsumer()).toBe(false)
	})
})
