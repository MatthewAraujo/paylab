// A pure, deterministic description of the demo data. No database and no clock of its
// own: the caller passes `now`, so tests replay exactly what the seed will write.
//
// The plan replays the Settlement rule while it is built: a Payment succeeds exactly when
// its source Wallet holds enough at that instant, otherwise it fails with INSUFFICIENT_FUNDS.
// So the data is what the real write path would have produced, and no Wallet is overdrawn.

export interface DemoMerchant {
	key: 'store' | 'rival'
	name: string
}

export interface DemoWallet {
	key: string
	merchant: DemoMerchant['key']
	createdAt: Date
}

export interface DemoFunding {
	kind: 'FUNDING'
	wallet: string
	/** Integer centavos. */
	amount: number
	at: Date
}

export interface DemoPayment {
	kind: 'PAYMENT'
	source: string
	destination: string
	/** Integer centavos. */
	amount: number
	status: 'SUCCEEDED' | 'FAILED'
	at: Date
}

export type DemoEvent = DemoFunding | DemoPayment

export interface DemoPlan {
	merchants: DemoMerchant[]
	wallets: DemoWallet[]
	events: DemoEvent[]
}

interface PlanOptions {
	now: Date
	seed?: number
}

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
const DAYS = 14
const DEFAULT_SEED = 20260923
const FAILURE_RATE = 0.18

const MERCHANTS: DemoMerchant[] = [
	{ key: 'store', name: 'Demo Store' },
	{ key: 'rival', name: 'Demo Rival' },
]
const WALLETS_PER_MERCHANT = { store: 6, rival: 2 }
const PAYMENTS_PER_MERCHANT = { store: 140, rival: 14 }

/** Small seeded generator (mulberry32): the same seed always gives the same plan. */
function random(seed: number) {
	let state = seed >>> 0
	return () => {
		state = (state + 0x6d2b79f5) >>> 0
		let t = state
		t = Math.imul(t ^ (t >>> 15), t | 1)
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}
}

type Slot =
	| { kind: 'FUNDING'; wallet: string; at: number }
	| { kind: 'PAYMENT'; merchant: DemoMerchant['key']; at: number }

export function planDemoData({ now, seed = DEFAULT_SEED }: PlanOptions): DemoPlan {
	const next = random(seed)
	const between = (low: number, high: number) => low + Math.floor(next() * (high - low + 1))
	const start = now.getTime() - DAYS * DAY_MS
	const end = now.getTime() - 5 * MINUTE_MS

	const wallets: DemoWallet[] = []
	for (const merchant of MERCHANTS) {
		for (let index = 1; index <= WALLETS_PER_MERCHANT[merchant.key]; index++) {
			wallets.push({
				key: `${merchant.key}-${wallets.length + 1}`,
				merchant: merchant.key,
				createdAt: new Date(start + wallets.length * MINUTE_MS),
			})
		}
	}

	// When things happen: an opening funding per Wallet, top-ups for the main Merchant's
	// Wallets, and the Payments spread over the whole period.
	const slots: Slot[] = []
	for (const wallet of wallets) {
		slots.push({
			kind: 'FUNDING',
			wallet: wallet.key,
			at: wallet.createdAt.getTime() + 5 * MINUTE_MS,
		})
		if (wallet.merchant === 'store') {
			for (let topUp = 0; topUp < 2; topUp++) {
				slots.push({ kind: 'FUNDING', wallet: wallet.key, at: between(start + DAY_MS, end) })
			}
		}
	}
	for (const merchant of MERCHANTS) {
		for (let i = 0; i < PAYMENTS_PER_MERCHANT[merchant.key]; i++) {
			slots.push({
				kind: 'PAYMENT',
				merchant: merchant.key,
				at: between(start + 60 * MINUTE_MS, end),
			})
		}
	}
	slots.sort((a, b) => a.at - b.at)

	const balances = new Map<string, number>()
	const events: DemoEvent[] = []

	for (const slot of slots) {
		const at = new Date(slot.at)

		if (slot.kind === 'FUNDING') {
			const amount = between(300_000, 900_000)
			balances.set(slot.wallet, (balances.get(slot.wallet) ?? 0) + amount)
			events.push({ kind: 'FUNDING', wallet: slot.wallet, amount, at })
			continue
		}

		const own = wallets.filter((wallet) => wallet.merchant === slot.merchant)
		const source = own[between(0, own.length - 1)].key
		const others = own.filter((wallet) => wallet.key !== source)
		const destination = others[between(0, others.length - 1)].key
		const balance = balances.get(source) ?? 0

		// Some Payments are deliberately larger than the Balance, so failures appear.
		const overdraw = next() < FAILURE_RATE || balance < 1_000
		const amount = overdraw
			? balance + between(1_000, 400_000)
			: Math.min(balance, between(500, 150_000))
		const status = balance >= amount ? 'SUCCEEDED' : 'FAILED'

		if (status === 'SUCCEEDED') {
			balances.set(source, balance - amount)
			balances.set(destination, (balances.get(destination) ?? 0) + amount)
		}
		events.push({ kind: 'PAYMENT', source, destination, amount, status, at })
	}

	return { merchants: MERCHANTS, wallets, events }
}
