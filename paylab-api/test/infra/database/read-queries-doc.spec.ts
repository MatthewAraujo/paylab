import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
	DAILY_REPORT_SQL,
	HISTORY_FIRST_PAGE_SQL,
	HISTORY_NEXT_PAGE_SQL,
	WALLET_LIST_FIRST_PAGE_SQL,
	WALLET_LIST_NEXT_PAGE_SQL,
	buildPaymentListQuery,
} from '@/infra/database/read-queries-sql'

// docs/reads-sql.md is what T12 to T14 copy queries from, so it must show exactly
// the text the application runs.
const doc = readFileSync(join(process.cwd(), 'docs/reads-sql.md'), 'utf8')

describe('docs/reads-sql.md', () => {
	test.each([
		['history first page', HISTORY_FIRST_PAGE_SQL],
		['history next page', HISTORY_NEXT_PAGE_SQL],
		['daily report', DAILY_REPORT_SQL],
		['Wallet list first page', WALLET_LIST_FIRST_PAGE_SQL],
		['Wallet list next page', WALLET_LIST_NEXT_PAGE_SQL],
	])('contains the exact %s SQL', (_name, sql) => {
		expect(doc).toContain(sql)
	})

	test('contains the Payment list query for no filters and for every filter at once', () => {
		const id = '00000000-0000-4000-8000-000000000000'
		const at = new Date(0)
		const bare = buildPaymentListQuery({ merchantId: id, fetch: 21 })
		const full = buildPaymentListQuery({
			merchantId: id,
			accountId: id,
			status: 'FAILED',
			from: at,
			to: at,
			after: { createdAt: at, id },
			fetch: 21,
		})

		expect(doc).toContain(bare.text)
		expect(doc).toContain(full.text)
	})
})
