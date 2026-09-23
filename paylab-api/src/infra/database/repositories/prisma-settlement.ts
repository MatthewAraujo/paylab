import { Either, left, right } from '@/core/either'
import { SettlementPort } from '@/domain/paylab/application/repositories/settlement-port'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { InvalidPaymentTransitionError } from '@/domain/paylab/enterprise/errors/invalid-payment-transition-error'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'
import { paymentInclude, paymentToDomain } from '../mappers/payment-mapper'
import { PrismaService } from '../prisma.service'

/**
 * Settlement (ADR 0001, ADR 0002): one READ COMMITTED transaction that decides
 * funds sufficiency under a lock on the source Wallet, then either posts the
 * Ledger Transaction and marks the Payment SUCCEEDED or marks it FAILED.
 *
 * This is the critical path, so it is raw SQL (ADR 0004). Money stays in the
 * database's 64-bit integers here (`bigint`); nothing is converted to `number`
 * until the Payment is mapped back to the domain.
 */
@Injectable()
export class PrismaSettlement implements SettlementPort {
	constructor(private prisma: PrismaService) {}

	async settle(payment: Payment): Promise<Either<InvalidPaymentTransitionError, Payment>> {
		const id = payment.id.toString()

		return this.prisma.$transaction(
			async (tx) => {
				// 1. CREATED -> PROCESSING (or resume a PROCESSING one). The row lock this
				//    UPDATE takes also serializes two Settlements of the same Payment, and a
				//    terminal Payment matches nothing, so it is rejected untouched. The
				//    database, not the in-memory entity, is the authority on the status.
				const claimed = await tx.$queryRaw<
					{ source_account_id: string; destination_account_id: string; amount: bigint }[]
				>`UPDATE payments
				  SET status = 'PROCESSING', updated_at = now()
				  WHERE id = ${id}::uuid AND status IN ('CREATED', 'PROCESSING')
				  RETURNING source_account_id, destination_account_id, amount`

				if (claimed.length === 0) {
					const current = await tx.payment.findUniqueOrThrow({
						where: { id },
						select: { status: true },
					})

					return left(new InvalidPaymentTransitionError(current.status, 'PROCESSING'))
				}

				const [{ source_account_id: sourceId, destination_account_id: destinationId, amount }] =
					claimed

				// 2. Lock the source Wallet, and only the source Wallet (a Balance Consumer).
				//    An External Clearing Account matches nothing here, so it is never locked
				//    and runs no funds check. The destination is never locked, so crossed
				//    transfers cannot deadlock: each Settlement holds at most one lock.
				//
				//    FOR NO KEY UPDATE, not FOR UPDATE: inserting a Ledger Entry takes
				//    FOR KEY SHARE on the referenced Account through the foreign key. That
				//    conflicts with FOR UPDATE but not with FOR NO KEY UPDATE, so a credit to
				//    this Wallet is not blocked behind an in-flight debit, while two debits
				//    still exclude each other (FOR NO KEY UPDATE conflicts with itself).
				const locked = await tx.$queryRaw<{ id: string }[]>`
					SELECT id FROM accounts
					WHERE id = ${sourceId}::uuid AND kind = 'WALLET'
					FOR NO KEY UPDATE`

				if (locked.length > 0) {
					// 3. Balance from the ledger, read after the lock is held: no other debit can
					//    commit between this read and our insert, and READ COMMITTED gives each
					//    statement a fresh snapshot, so this sees every debit committed before us.
					const [{ balance }] = await tx.$queryRaw<{ balance: bigint }[]>`
						SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
						FROM ledger_entries
						WHERE account_id = ${sourceId}::uuid`

					if (balance < amount) {
						await tx.$executeRaw`
							UPDATE payments
							SET status = 'FAILED', failure_reason = 'INSUFFICIENT_FUNDS', updated_at = now()
							WHERE id = ${id}::uuid`

						return right(await this.reload(tx, id))
					}
				}

				// 4. Post the Ledger Transaction and both entries, and finish the Payment, in
				//    this same transaction. The deferred balance trigger (ADR 0003) checks the
				//    entries at commit.
				const [{ id: ledgerTransactionId }] = await tx.$queryRaw<{ id: string }[]>`
					INSERT INTO ledger_transactions DEFAULT VALUES RETURNING id`

				await tx.$executeRaw`
					INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount)
					VALUES (${ledgerTransactionId}::uuid, ${sourceId}::uuid, 'DEBIT', ${amount}),
					       (${ledgerTransactionId}::uuid, ${destinationId}::uuid, 'CREDIT', ${amount})`

				await tx.$executeRaw`
					UPDATE payments
					SET status = 'SUCCEEDED', ledger_transaction_id = ${ledgerTransactionId}::uuid, updated_at = now()
					WHERE id = ${id}::uuid`

				return right(await this.reload(tx, id))
			},
			{
				isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
				maxWait: 5_000,
				timeout: 15_000,
			},
		)
	}

	private async reload(tx: Prisma.TransactionClient, id: string): Promise<Payment> {
		const row = await tx.payment.findUniqueOrThrow({ where: { id }, include: paymentInclude })

		return paymentToDomain(row)
	}
}
