import { Either } from '@/core/either'
import { Payment } from '../../enterprise/entities/payment'
import { InvalidPaymentTransitionError } from '../../enterprise/errors/invalid-payment-transition-error'

/**
 * Settlement: the single atomic step that writes a Payment's Ledger Transaction
 * and moves the Payment to SUCCEEDED, or to FAILED (INSUFFICIENT_FUNDS) for a
 * Balance Consumer that cannot cover the Amount. Insufficient funds is a normal
 * outcome (a FAILED Payment), not an error. The only error is settling a Payment
 * that is already terminal, which changes nothing.
 */
export abstract class SettlementPort {
	abstract settle(payment: Payment): Promise<Either<InvalidPaymentTransitionError, Payment>>
}
