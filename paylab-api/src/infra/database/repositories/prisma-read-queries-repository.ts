import {
	DailyReportRow,
	KeysetPosition,
	LedgerEntryItem,
	PaymentListFilter,
	PaymentListItem,
	ReadQueriesRepository,
	WalletListItem,
} from '@/domain/paylab/application/repositories/read-queries-repository'
import { Injectable } from '@nestjs/common'
import { centavosToNumber } from '../mappers/money-mapper'
import { PrismaService } from '../prisma.service'
import {
	DAILY_REPORT_SQL,
	HISTORY_FIRST_PAGE_SQL,
	HISTORY_NEXT_PAGE_SQL,
	WALLET_LIST_FIRST_PAGE_SQL,
	WALLET_LIST_NEXT_PAGE_SQL,
	buildPaymentListQuery,
} from '../read-queries-sql'

interface EntryRow {
	id: string
	ledger_transaction_id: string
	direction: 'DEBIT' | 'CREDIT'
	amount: bigint
	created_at: Date
}

interface WalletRow {
	id: string
	currency: string
	created_at: Date
}

interface PaymentRow {
	id: string
	source_account_id: string
	destination_account_id: string
	amount: bigint
	currency: string
	status: string
	failure_reason: string | null
	ledger_transaction_id: string | null
	created_at: Date
	updated_at: Date
}

interface ReportRow {
	day: string
	status: string
	count: bigint
	volume: bigint
}

/** Keyset reads as raw SQL (ADR 0004). The query text lives in `read-queries-sql.ts`. */
@Injectable()
export class PrismaReadQueriesRepository implements ReadQueriesRepository {
	constructor(private prisma: PrismaService) {}

	async listEntries(input: {
		accountId: string
		after?: KeysetPosition
		fetch: number
	}): Promise<LedgerEntryItem[]> {
		const rows = input.after
			? await this.prisma.$queryRawUnsafe<EntryRow[]>(
					HISTORY_NEXT_PAGE_SQL,
					input.accountId,
					input.after.createdAt,
					input.after.id,
					input.fetch,
				)
			: await this.prisma.$queryRawUnsafe<EntryRow[]>(
					HISTORY_FIRST_PAGE_SQL,
					input.accountId,
					input.fetch,
				)

		return rows.map((row) => ({
			id: row.id,
			ledgerTransactionId: row.ledger_transaction_id,
			direction: row.direction,
			amount: centavosToNumber(row.amount),
			createdAt: row.created_at,
		}))
	}

	async listWallets(input: {
		merchantId: string
		after?: KeysetPosition
		fetch: number
	}): Promise<WalletListItem[]> {
		const rows = input.after
			? await this.prisma.$queryRawUnsafe<WalletRow[]>(
					WALLET_LIST_NEXT_PAGE_SQL,
					input.merchantId,
					input.after.createdAt,
					input.after.id,
					input.fetch,
				)
			: await this.prisma.$queryRawUnsafe<WalletRow[]>(
					WALLET_LIST_FIRST_PAGE_SQL,
					input.merchantId,
					input.fetch,
				)

		return rows.map((row) => ({
			id: row.id,
			kind: 'WALLET',
			currency: row.currency,
			createdAt: row.created_at,
		}))
	}

	async listPayments(
		input: PaymentListFilter & { merchantId: string; after?: KeysetPosition; fetch: number },
	): Promise<PaymentListItem[]> {
		const { text, params } = buildPaymentListQuery(input)
		const rows = await this.prisma.$queryRawUnsafe<PaymentRow[]>(text, ...params)

		return rows.map((row) => ({
			id: row.id,
			sourceAccountId: row.source_account_id,
			destinationAccountId: row.destination_account_id,
			amount: centavosToNumber(row.amount),
			currency: row.currency,
			status: row.status,
			failureReason: row.failure_reason,
			ledgerTransactionId: row.ledger_transaction_id,
			createdAt: row.created_at,
			updatedAt: row.updated_at,
		}))
	}

	async dailyReport(input: { merchantId: string; from: Date; to: Date }): Promise<
		DailyReportRow[]
	> {
		const rows = await this.prisma.$queryRawUnsafe<ReportRow[]>(
			DAILY_REPORT_SQL,
			input.merchantId,
			input.from,
			input.to,
		)

		return rows.map((row) => ({
			date: row.day,
			status: row.status,
			count: centavosToNumber(row.count),
			volume: centavosToNumber(row.volume),
		}))
	}
}
