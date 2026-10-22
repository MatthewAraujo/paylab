import { ProviderTransactionEvent } from '@/domain/provider-transaction'
import { PrismaService } from '@/infra/database/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma, type ProviderTransaction } from '@prisma/client'

export type NewProviderTransaction = Prisma.ProviderTransactionUncheckedCreateInput

const IDEMPOTENCY_KEY_COLUMN = 'idempotency_key'

@Injectable()
export class ProviderTransactionRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * AC-27: the transaction (in its final state) and every event it produced, in one database
	 * transaction; events are inserted one by one so their sequence keeps the given order.
	 *
	 * AC-4/AC-31: the unique (client id, Idempotency Key) index is the only arbiter of duplicates.
	 * When the Client already has a Provider Transaction under this key (committed, or committed
	 * by a concurrent insert this one waited for), the whole database transaction rolls back and
	 * this returns `null`; nothing of this attempt is persisted.
	 */
	async insertWithEvents(
		transaction: NewProviderTransaction,
		events: ProviderTransactionEvent[],
	): Promise<ProviderTransaction | null> {
		try {
			return await this.insertAtomically(transaction, events)
		} catch (error) {
			if (isIdempotencyKeyViolation(error)) {
				return null
			}
			throw error
		}
	}

	findByIdempotencyKey(
		clientId: string,
		idempotencyKey: string,
	): Promise<ProviderTransaction | null> {
		return this.prisma.providerTransaction.findUnique({
			where: { clientId_idempotencyKey: { clientId, idempotencyKey } },
		})
	}

	private insertAtomically(
		transaction: NewProviderTransaction,
		events: ProviderTransactionEvent[],
	): Promise<ProviderTransaction> {
		return this.prisma.$transaction(async (tx) => {
			const created = await tx.providerTransaction.create({ data: transaction })
			for (const event of events) {
				await tx.providerTransactionEvent.create({
					data: {
						id: event.id,
						providerTransactionId: event.providerTransactionId,
						type: event.type,
						status: event.status,
						failureCode: event.failureCode,
						occurredAt: event.occurredAt,
					},
				})
			}
			return created
		})
	}

	/** Scoped to the Client: another Client's id is indistinguishable from an unknown one. */
	findForClient(clientId: string, id: string): Promise<ProviderTransaction | null> {
		return this.prisma.providerTransaction.findFirst({ where: { id, clientId } })
	}
}

function isIdempotencyKeyViolation(error: unknown): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
		return false
	}
	const target = error.meta?.target
	const columns = Array.isArray(target) ? target : [target]
	return columns.some(
		(column) => typeof column === 'string' && column.includes(IDEMPOTENCY_KEY_COLUMN),
	)
}
