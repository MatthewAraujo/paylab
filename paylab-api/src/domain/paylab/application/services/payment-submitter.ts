import { Either, left, right } from '@/core/either'
import { Injectable } from '@nestjs/common'
import { Payment } from '../../enterprise/entities/payment'
import { PaymentsRepository } from '../repositories/payments-repository'
import { IdempotencyKeyReusedError } from '../use-cases/errors/idempotency-key-reused-error'
import { SettlePaymentUseCase } from '../use-cases/settle-payment'

export interface SubmittedPayment {
	payment: Payment
	/** True when the Idempotency Key already existed and its Payment is being returned. */
	replayed: boolean
}

/**
 * The two-transaction flow of ADR 0001, shared by every way a Payment enters the
 * system (the public API and the internal funding path).
 *
 *   Transaction one: persist the Payment as CREATED with its Idempotency Key.
 *                    The unique (Merchant, key) constraint is the only arbiter,
 *                    so concurrent identical requests cannot both insert.
 *   Transaction two: Settlement (lock, funds check, ledger write, terminal state).
 *
 * A Payment stranded in CREATED by a crash is finished by the next request with
 * the same key. That cannot double-settle: the Settlement claims the row with a
 * status-guarded UPDATE, which takes the row lock, so a concurrent or repeated
 * attempt either waits and then sees a terminal Payment (rejected untouched) or
 * runs alone. PROCESSING is never committed in September (it exists only inside
 * the Settlement transaction), so a CREATED or PROCESSING row found here is
 * always unsettled work to resume, never an in-flight one to wait for.
 */
@Injectable()
export class PaymentSubmitter {
	constructor(
		private paymentsRepository: PaymentsRepository,
		private settlePayment: SettlePaymentUseCase,
	) {}

	/** Replay path: the key exists. Same request resumes or returns; a different one is rejected. */
	async replayIfExists(
		merchantId: string,
		idempotencyKey: string,
		fingerprint: string,
	): Promise<Either<IdempotencyKeyReusedError, SubmittedPayment> | null> {
		const existing = await this.paymentsRepository.findByIdempotencyKey(merchantId, idempotencyKey)

		if (!existing) {
			return null
		}

		if (existing.requestFingerprint !== fingerprint) {
			return left(new IdempotencyKeyReusedError())
		}

		return right({ payment: await this.resume(existing), replayed: true })
	}

	async submit(payment: Payment): Promise<Either<IdempotencyKeyReusedError, SubmittedPayment>> {
		const created = await this.paymentsRepository.create(payment)

		if (!created) {
			// Lost the race on the unique key: another request inserted first.
			const replay = await this.replayIfExists(
				payment.merchantId,
				payment.idempotencyKey,
				payment.requestFingerprint,
			)

			if (replay) {
				return replay
			}
		}

		return right({ payment: await this.resume(payment), replayed: !created })
	}

	// A terminal Payment is returned as it is (a FAILED one stays failed for its key).
	private async resume(payment: Payment): Promise<Payment> {
		if (payment.status === 'SUCCEEDED' || payment.status === 'FAILED') {
			return payment
		}

		const settled = await this.settlePayment.execute({ paymentId: payment.id.toString() })

		if (settled.isRight()) {
			return settled.value.payment
		}

		// Another request settled it between our read and our claim: return its outcome.
		return (await this.paymentsRepository.findById(payment.id.toString())) ?? payment
	}
}
