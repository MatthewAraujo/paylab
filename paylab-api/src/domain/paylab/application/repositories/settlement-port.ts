import { Payment } from '../../enterprise/entities/payment'

/**
 * Settlement: the single atomic step that writes a Payment's Ledger Transaction
 * and moves the Payment to SUCCEEDED, or to FAILED (INSUFFICIENT_FUNDS) for a
 * Balance Consumer that cannot cover the Amount. Interface only; implemented in T6.
 */
export abstract class SettlementPort {
	abstract settle(payment: Payment): Promise<Payment>
}
