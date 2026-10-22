import { prisma } from '../support/database'

const TRANSACTION_ID = 'FBK-01929b2e-6f3a-7c1d-9a4f-3f1e2d6c9b7a'
const EVENT_ID = '5f0c7c1e-2d3b-4a5c-8d6e-7f8091a2b3c4'

// AC-28: the event history is append-only at the database level; catches a bug or a script
// rewriting history, whatever the application does.
describe('provider_transaction_event immutability', () => {
	beforeEach(async () => {
		await prisma.$executeRaw`
			INSERT INTO provider_transaction (id, client_id, external_reference, idempotency_key,
				request_fingerprint, amount_minor, currency, status, created_at, updated_at)
			VALUES (${TRANSACTION_ID}, 'paylab', 'payment-123', 'key-1', 'fingerprint', 1500, 'BRL',
				'PROCESSING', now(), now())`
		await prisma.$executeRaw`
			INSERT INTO provider_transaction_event (id, provider_transaction_id, type, status, occurred_at)
			VALUES (${EVENT_ID}::uuid, ${TRANSACTION_ID}, 'transaction.processing', 'PROCESSING', now())`
	})

	it('rejects UPDATE', async () => {
		await expect(
			prisma.$executeRaw`UPDATE provider_transaction_event SET status = 'SUCCEEDED' WHERE id = ${EVENT_ID}::uuid`,
		).rejects.toThrow(/append-only/)

		const [event] = await prisma.$queryRaw<{ status: string }[]>`
			SELECT status FROM provider_transaction_event WHERE id = ${EVENT_ID}::uuid`
		expect(event.status).toBe('PROCESSING')
	})

	it('rejects DELETE', async () => {
		await expect(
			prisma.$executeRaw`DELETE FROM provider_transaction_event WHERE id = ${EVENT_ID}::uuid`,
		).rejects.toThrow(/append-only/)

		const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`
			SELECT count(*) AS count FROM provider_transaction_event`
		expect(count).toBe(1n)
	})
})
