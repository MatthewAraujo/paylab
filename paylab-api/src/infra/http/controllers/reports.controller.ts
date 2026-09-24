import { GetDailyReportUseCase } from '@/domain/paylab/application/use-cases/get-daily-report'
import { ApiKeyGuard } from '@/infra/auth/api-key.guard'
import { CurrentMerchant, MerchantContext } from '@/infra/auth/current-merchant.decorator'
import { calendarDaySchema } from '@/infra/http/pagination/query-schemas'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Controller, Get, Query, UseGuards } from '@nestjs/common'
import { ApiQuery, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'

// The report covers whole UTC days, both ends inclusive, at most a year at a time.
const MAX_DAYS = 366
const DAY_MS = 24 * 60 * 60 * 1000

const dailyQuerySchema = z
	.object({ from: calendarDaySchema, to: calendarDaySchema })
	.strict()
	.superRefine((query, ctx) => {
		const days = (Date.parse(query.to) - Date.parse(query.from)) / DAY_MS + 1

		if (days < 1) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: '`from` must not be after `to`.',
				path: ['from'],
			})
		} else if (days > MAX_DAYS) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `The range is limited to ${MAX_DAYS} days.`,
				path: ['to'],
			})
		}
	})

type DailyQuery = z.infer<typeof dailyQuerySchema>

import { ApiReadRoute } from '../openapi/decorators'
import { DailyReportResponse } from '../openapi/responses'

@ApiTags('Reports')
@Controller('v1/reports')
@UseGuards(ApiKeyGuard)
export class ReportsController {
	constructor(private getDailyReport: GetDailyReportUseCase) {}

	@Get('daily')
	@ApiReadRoute(DailyReportResponse, { validated: true })
	@ApiQuery({
		name: 'from',
		required: true,
		description: 'First UTC day, inclusive, YYYY-MM-DD.',
		schema: { type: 'string', format: 'date' },
	})
	@ApiQuery({
		name: 'to',
		required: true,
		description: 'Last UTC day, inclusive, YYYY-MM-DD. The range is at most 366 days.',
		schema: { type: 'string', format: 'date' },
	})
	async daily(
		@CurrentMerchant() merchant: MerchantContext,
		@Query(new ZodValidationPipe(dailyQuerySchema)) query: DailyQuery,
	) {
		const { items } = await this.getDailyReport.execute({
			merchantId: merchant.id,
			fromDay: query.from,
			toDay: query.to,
		})

		return { from: query.from, to: query.to, items }
	}
}
