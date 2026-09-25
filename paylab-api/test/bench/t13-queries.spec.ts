import { scenarioFingerprint } from '@/domain/benchmark/canonical'
import { safeId } from '@/domain/benchmark/summary'
import { T13_PROTOCOL } from '../../bench/scenarios/measure'
import { T13_QUERIES, render } from '../../bench/scenarios/t13-queries'

describe('T13 read query definitions', () => {
	it('cover the documented reads: history, balance, Payment list variants, reports, and pagination depth', () => {
		const ids = T13_QUERIES.map((query) => query.id)

		expect(ids).toHaveLength(33)
		expect(new Set(ids).size).toBe(33)
		for (const expected of [
			't13.history.first-page.hot-wallet',
			't13.history.next-page.cold-wallet',
			't13.balance.hot-wallet',
			't13.payments.first-page.hot-merchant',
			't13.payments.next-page-deep.cold-merchant',
			't13.payments.status-created.hot-merchant',
			't13.payments.account-filter-rare.cold-merchant',
			't13.payments.period-30d.hot-merchant',
			't13.report.90d.cold-merchant',
			't13.depth.keyset.50000',
			't13.depth.offset.90000',
		]) {
			expect(ids, expected).toContain(expected)
		}
	})

	it('has identifiers that are safe file names', () => {
		for (const query of T13_QUERIES) {
			expect(safeId.safeParse(query.id).success, query.id).toBe(true)
		}
	})

	it('gives every query a distinct definition fingerprint under the T13 protocol', () => {
		const fingerprints = T13_QUERIES.map((query) =>
			scenarioFingerprint({ id: query.id, protocol: T13_PROTOCOL, config: query.config }),
		)

		expect(new Set(fingerprints).size).toBe(T13_QUERIES.length)
	})

	it('records the SQL text hash in the config, so a changed query is a changed workload', () => {
		for (const query of T13_QUERIES) {
			expect(query.config.sqlSha, query.id).toMatch(/^[0-9a-f]{64}$/)
		}
		const first = T13_QUERIES.find((q) => q.id === 't13.history.first-page.hot-wallet')
		expect(first?.config).toMatchObject({ shape: 'history-first-page', subject: 'hot-wallet' })
	})

	it('keeps the request for one page more than the page size, like the application', () => {
		const first = T13_QUERIES.find((q) => q.id === 't13.history.first-page.hot-wallet')
		expect(first?.template).toContain('ORDER BY created_at DESC, id DESC LIMIT 21')
	})
})

describe('render', () => {
	it('fills every placeholder', () => {
		expect(render("WHERE id = '{id}'::uuid AND n < {n}", { id: 'abc', n: '5' })).toBe(
			"WHERE id = 'abc'::uuid AND n < 5",
		)
	})

	it('fails on a missing value instead of running a broken query', () => {
		expect(() => render('WHERE id = {id}', {})).toThrow(/id/)
	})

	it('refuses values that could change the statement', () => {
		expect(() => render("WHERE id = '{id}'", { id: "x'; DROP TABLE payments; --" })).toThrow(
			/unsafe/i,
		)
	})
})
