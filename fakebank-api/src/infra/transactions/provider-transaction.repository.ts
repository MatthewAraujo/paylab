import { ProviderTransactionEvent } from '@/domain/provider-transaction'
import { PrismaService } from '@/infra/database/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma, type ProviderTransaction } from '@prisma/client'

export type NewProviderTransaction = Prisma.ProviderTransactionUncheckedCreateInput

export type BuildNewProviderTransaction = (db: Prisma.TransactionClient) => Promise<{
	transaction: NewProviderTransaction
	events: ProviderTransactionEvent[]
}>

const IDEMPOTENCY_KEY_COLUMN = 'idempotency_key'

@Injectable()
export class ProviderTransactionRepository {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * AC-27: `build` decides the transaction (in its final state) and every event it produced
	 * inside one database transaction, which then inserts them; events are inserted one by one so
	 * their sequence keeps the given order. `build` receives the database transaction, so what it
	 * writes there (a consumed scenario attempt) commits or rolls back with the insert.
	 *
	 * AC-4/AC-31: the unique (client id, Idempotency Key) index is the only arbiter of duplicates.
	 * When the Client already has a Provider Transaction under this key (committed, or committed
	 * by a concurrent insert this one waited for), the whole database transaction rolls back and
	 * this returns `null`; nothing of this attempt is persisted.
	 */
	async insertWithEvents(build: BuildNewProviderTransaction): Promise<ProviderTransaction | null> {
		try {
			return await this.insertAtomically(build)
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

	private insertAtomically(build: BuildNewProviderTransaction): Promise<ProviderTransaction> {
		return this.prisma.$transaction(async (tx) => {
			const { transaction, events } = await build(tx)
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

	/**
	 * AC-8: every Provider Transaction of the Client carrying the External Reference, oldest first
	 * (served by the (client_id, external_reference, created_at) index). External References are
	 * not unique, so nothing is deduplicated. Ties within one millisecond are broken by id, which
	 * keeps the order stable across reads.
	 */
	listByExternalReference(
		clientId: string,
		externalReference: string,
	): Promise<ProviderTransaction[]> {
		return this.prisma.providerTransaction.findMany({
			where: { clientId, externalReference },
			orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
		})
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
