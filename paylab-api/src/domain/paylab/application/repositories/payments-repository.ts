import { Payment } from '../../enterprise/entities/payment'

export abstract class PaymentsRepository {
	abstract findById(id: string): Promise<Payment | null>
	abstract findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Payment | null>
	abstract create(payment: Payment): Promise<void>
	abstract save(payment: Payment): Promise<void>
}
