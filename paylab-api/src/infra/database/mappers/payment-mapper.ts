import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { Amount } from '@/domain/paylab/enterprise/entities/value-objects/amount'
import { Prisma, Payment as PrismaPayment } from '@prisma/client'
import { centavosToBigInt, centavosToNumber } from './money-mapper'

// A Payment row together with the kind of its source Account, so the domain can
// tell a Balance Consumer without another lookup.
export const paymentInclude = {
	sourceAccount: { select: { kind: true } },
} satisfies Prisma.PaymentInclude

export type PaymentRow = Prisma.PaymentGetPayload<{ include: typeof paymentInclude }>

export function paymentToDomain(row: PaymentRow): Payment {
	const amount = Amount.create(centavosToNumber(row.amount))

	if (amount.isLeft()) {
		throw new Error(`Payment ${row.id} has an invalid persisted amount`)
	}

	return Payment.restore(
		{
			merchantId: row.merchantId,
			sourceAccountId: new UniqueEntityID(row.sourceAccountId),
			sourceAccountKind: row.sourceAccount.kind,
			destinationAccountId: new UniqueEntityID(row.destinationAccountId),
			amount: amount.value,
			currency: row.currency,
			status: row.status,
			failureReason: (row.failureReason as 'INSUFFICIENT_FUNDS' | null) ?? undefined,
			idempotencyKey: row.idempotencyKey,
			requestFingerprint: row.requestFingerprint,
			ledgerTransactionId: row.ledgerTransactionId
				? new UniqueEntityID(row.ledgerTransactionId)
				: undefined,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		},
		new UniqueEntityID(row.id),
	)
}

export function paymentToPrisma(payment: Payment): Prisma.PaymentUncheckedCreateInput {
	return {
		id: payment.id.toString(),
		merchantId: payment.merchantId,
		sourceAccountId: payment.sourceAccountId.toString(),
		destinationAccountId: payment.destinationAccountId.toString(),
		amount: centavosToBigInt(payment.amount.toNumber()),
		currency: payment.currency,
		status: payment.status,
		failureReason: payment.failureReason ?? null,
		idempotencyKey: payment.idempotencyKey,
		requestFingerprint: payment.requestFingerprint,
		ledgerTransactionId: payment.ledgerTransactionId?.toString() ?? null,
		createdAt: payment.createdAt,
		updatedAt: payment.updatedAt,
	}
}
