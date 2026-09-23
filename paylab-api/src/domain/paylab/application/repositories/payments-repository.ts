import { Payment } from '../../enterprise/entities/payment'

export abstract class PaymentsRepository {
	abstract findById(id: string): Promise<Payment | null>
	abstract findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Payment | null>
	/**
	 * Inserts the Payment. Returns false, writing nothing, when the (Merchant, Idempotency Key)
	 * pair already exists: the database unique constraint decides, not a prior read.
	 */
	abstract create(payment: Payment): Promise<boolean>
	abstract save(payment: Payment): Promise<void>
}
