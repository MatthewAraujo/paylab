import { ProviderTransactionEvent } from '@/domain/provider-transaction'
import { PrismaService } from '@/infra/database/prisma.service'
import { Injectable } from '@nestjs/common'
import type { Prisma, ProviderTransaction } from '@prisma/client'

export type NewProviderTransaction = Prisma.ProviderTransactionUncheckedCreateInput

@Injectable()
export class ProviderTransactionRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * AC-27: the transaction (in its final state) and every event it produced, in one database
	 * transaction; events are inserted one by one so their sequence keeps the given order.
	 */
	async insertWithEvents(
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
