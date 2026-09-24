import { DemoEvent, planDemoData } from '../../scripts/demo/plan'

const now = new Date('2026-09-23T12:00:00.000Z')
const plan = planDemoData({ now })

function replay(events: DemoEvent[]) {
	const balances = new Map<string, number>()
	const minimum = { value: 0 }
	for (const event of events) {
		if (event.kind === 'FUNDING') {
			balances.set(event.wallet, (balances.get(event.wallet) ?? 0) + event.amount)
		} else if (event.status === 'SUCCEEDED') {
			balances.set(event.source, (balances.get(event.source) ?? 0) - event.amount)
			balances.set(event.destination, (balances.get(event.destination) ?? 0) + event.amount)
		}
		for (const balance of balances.values()) {
			minimum.value = Math.min(minimum.value, balance)
		}
	}
	return { balances, minimum: minimum.value }
}

describe('planDemoData', () => {
	test('is deterministic for a given clock and seed', () => {
		expect(planDemoData({ now })).toEqual(plan)
		expect(planDemoData({ now, seed: 7 })).not.toEqual(plan)
	})

	test('has a main Merchant and a second one to show isolation', () => {
		expect(plan.merchants.map((merchant) => merchant.name)).toEqual(['Demo Store', 'Demo Rival'])
		expect(
			plan.wallets.filter((wallet) => wallet.merchant === 'store').length,
		).toBeGreaterThanOrEqual(4)
		expect(
			plan.wallets.filter((wallet) => wallet.merchant === 'rival').length,
		).toBeGreaterThanOrEqual(1)
	})

	test('events are chronological and never in the future', () => {
		const times = plan.events.map((event) => event.at.getTime())

		expect(times).toEqual([...times].sort((a, b) => a - b))
		expect(Math.max(...times)).toBeLessThan(now.getTime())
	})

	test('replaying the Settlement rule never overdraws a Wallet', () => {
		expect(replay(plan.events).minimum).toBeGreaterThanOrEqual(0)
	})

	test('a Payment fails exactly when the source cannot cover it', () => {
		const balances = new Map<string, number>()
		for (const event of plan.events) {
			if (event.kind === 'FUNDING') {
				balances.set(event.wallet, (balances.get(event.wallet) ?? 0) + event.amount)
				continue
			}
			const covered = (balances.get(event.source) ?? 0) >= event.amount
			expect(event.status).toBe(covered ? 'SUCCEEDED' : 'FAILED')
			if (covered) {
				balances.set(event.source, (balances.get(event.source) ?? 0) - event.amount)
				balances.set(event.destination, (balances.get(event.destination) ?? 0) + event.amount)
			}
		}
	})

	test('covers both outcomes and spans several days', () => {
		const payments = plan.events.filter((event) => event.kind === 'PAYMENT')
		const days = new Set(payments.map((payment) => payment.at.toISOString().slice(0, 10)))

		expect(payments.some((payment) => payment.status === 'SUCCEEDED')).toBe(true)
		expect(payments.some((payment) => payment.status === 'FAILED')).toBe(true)
		expect(days.size).toBeGreaterThanOrEqual(7)
	})

	test('gives the main Merchant more than one page of Payments and of a Wallet history', () => {
		const wallets = new Map(plan.wallets.map((wallet) => [wallet.key, wallet.merchant]))
		const storePayments = plan.events.filter(
			(event) => event.kind === 'PAYMENT' && wallets.get(event.source) === 'store',
		)
		const entriesPerWallet = new Map<string, number>()
		for (const event of plan.events) {
			const touched =
				event.kind === 'FUNDING'
					? [event.wallet]
					: event.status === 'SUCCEEDED'
						? [event.source, event.destination]
						: []
			for (const wallet of touched) {
				entriesPerWallet.set(wallet, (entriesPerWallet.get(wallet) ?? 0) + 1)
			}
		}

		expect(storePayments.length).toBeGreaterThan(20)
		expect(Math.max(...entriesPerWallet.values())).toBeGreaterThan(20)
	})

	test('a Payment always moves money between Wallets of one Merchant', () => {
		const wallets = new Map(plan.wallets.map((wallet) => [wallet.key, wallet.merchant]))

		for (const event of plan.events) {
			if (event.kind === 'PAYMENT') {
				expect(event.source).not.toBe(event.destination)
				expect(wallets.get(event.source)).toBe(wallets.get(event.destination))
				expect(Number.isSafeInteger(event.amount) && event.amount > 0).toBe(true)
			}
		}
	})
})
