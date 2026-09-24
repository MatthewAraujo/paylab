import { randomUUID } from 'node:crypto'
import { INestApplication } from '@nestjs/common'
import request from 'supertest'
import { prisma } from './database'
import { clearingAccountId } from './fixtures'
import type { TestMerchant } from './payments'

// Direct-SQL fixtures for the read endpoints: explicit creation times and statuses,
// which the write path cannot produce on demand.

// Commits one balanced Ledger Transaction (clearing debit, Wallet credit) whose
// Ledger Entries all carry `at`. Returns the Wallet's entry id.
export async function insertCreditAt(walletId: string, amount: number, at: Date) {
	const clearingId = await clearingAccountId()

	return prisma.$transaction(async (tx) => {
		const [{ id: transactionId }] = await tx.$queryRawUnsafe<{ id: string }[]>(
			'INSERT INTO ledger_transactions (created_at) VALUES ($1::timestamptz) RETURNING id',
			at,
		)
		const rows = await tx.$queryRawUnsafe<{ id: string; account_id: string }[]>(
			`INSERT INTO ledger_entries (ledger_transaction_id, account_id, direction, amount, created_at)
			 VALUES ($1::uuid, $2::uuid, 'DEBIT', $4, $5::timestamptz),
			        ($1::uuid, $3::uuid, 'CREDIT', $4, $5::timestamptz)
			 RETURNING id, account_id`,
			transactionId,
			clearingId,
			walletId,
			amount,
			at,
		)
		return rows.find((row) => row.account_id === walletId)?.id as string
	})
}

// A Wallet with an explicit creation time (the write path always uses now()).
export async function insertWalletAt(merchantId: string, at: Date) {
	const [{ id }] = await prisma.$queryRawUnsafe<{ id: string }[]>(
		`INSERT INTO accounts (kind, merchant_id, currency, created_at)
		 VALUES ('WALLET', $1::uuid, 'BRL', $2::timestamptz) RETURNING id`,
		merchantId,
		at,
	)
	return id
}

export async function insertPaymentAt(input: {
	merchantId: string
	sourceAccountId: string
	destinationAccountId: string
	amount: number
	status: 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED'
	at: Date
}) {
	const [{ id }] = await prisma.$queryRawUnsafe<{ id: string }[]>(
		`INSERT INTO payments (merchant_id, source_account_id, destination_account_id, amount, currency,
		                       status, idempotency_key, request_fingerprint, created_at, updated_at)
		 VALUES ($1::uuid, $2::uuid, $3::uuid, $4, 'BRL', $5::payment_status, $6, 'fp', $7::timestamptz, $7::timestamptz)
		 RETURNING id`,
		input.merchantId,
		input.sourceAccountId,
		input.destinationAccountId,
		input.amount,
		input.status,
		randomUUID(),
		input.at,
	)
	return id
}

export function get(app: INestApplication, merchant: TestMerchant, path: string) {
	return request(app.getHttpServer()).get(path).set('Authorization', merchant.auth)
}

// Follows nextCursor until the last page (starting after `startCursor` when given);
// returns every page's items in order.
export async function collectPages<T>(
	app: INestApplication,
	merchant: TestMerchant,
	path: string,
	limit: number,
	startCursor: string | null = null,
) {
	const pages: T[][] = []
	let cursor: string | null = startCursor
	const separator = path.includes('?') ? '&' : '?'

	do {
		const suffix: string = cursor ? `&cursor=${cursor}` : ''
		const response = await get(app, merchant, `${path}${separator}limit=${limit}${suffix}`)
		if (response.statusCode !== 200) {
			throw new Error(`Unexpected ${response.statusCode}: ${JSON.stringify(response.body)}`)
		}
		pages.push(response.body.items as T[])
		cursor = response.body.nextCursor as string | null
	} while (cursor)

	return pages
}
