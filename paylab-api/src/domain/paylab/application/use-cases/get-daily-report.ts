import { Injectable } from '@nestjs/common'
import { DailyReportRow, ReadQueriesRepository } from '../repositories/read-queries-repository'

const DAY_MS = 24 * 60 * 60 * 1000

interface GetDailyReportUseCaseRequest {
	merchantId: string
	/** First UTC day, `YYYY-MM-DD`, inclusive. */
	fromDay: string
	/** Last UTC day, `YYYY-MM-DD`, inclusive. */
	toDay: string
}

/**
 * Payment count and volume per UTC day and status for the caller's Merchant. Days are
 * UTC in September; the range is turned into a half-open instant range so the query
 * filters on `created_at` itself.
 */
@Injectable()
export class GetDailyReportUseCase {
	constructor(private readQueries: ReadQueriesRepository) {}

	async execute({
		merchantId,
		fromDay,
		toDay,
	}: GetDailyReportUseCaseRequest): Promise<{ items: DailyReportRow[] }> {
		const from = new Date(`${fromDay}T00:00:00.000Z`)
		const to = new Date(new Date(`${toDay}T00:00:00.000Z`).getTime() + DAY_MS)

		return { items: await this.readQueries.dailyReport({ merchantId, from, to }) }
	}
}
