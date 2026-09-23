import { PaymentListItem } from '@/domain/paylab/application/repositories/read-queries-repository'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'

export interface PaymentView {
	id: string
	sourceAccountId: string
	destinationAccountId: string
	/** Integer centavos. */
	amount: number
	currency: string
	status: string
	failureReason: string | null
	ledgerTransactionId: string | null
	createdAt: string
	updatedAt: string
}

export class PaymentPresenter {
	static listItemToHTTP(item: PaymentListItem): PaymentView {
		return {
			...item,
			createdAt: item.createdAt.toISOString(),
			updatedAt: item.updatedAt.toISOString(),
		}
	}

	static toHTTP(payment: Payment): PaymentView {
		return {
			id: payment.id.toString(),
			sourceAccountId: payment.sourceAccountId.toString(),
			destinationAccountId: payment.destinationAccountId.toString(),
			amount: payment.amount.toNumber(),
			currency: payment.currency,
			status: payment.status,
			failureReason: payment.failureReason ?? null,
			ledgerTransactionId: payment.ledgerTransactionId?.toString() ?? null,
			createdAt: payment.createdAt.toISOString(),
			updatedAt: payment.updatedAt.toISOString(),
		}
	}
}
