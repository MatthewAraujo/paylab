import { AuthenticateMerchantUseCase } from '@/domain/paylab/application/use-cases/authenticate-merchant'
import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaApiKeysRepository } from '@/infra/database/repositories/prisma-api-keys-repository'
import { Client } from 'pg'
import {
	DemoAlreadySeededError,
	applyDemoSeed,
	findInvariantViolations,
} from '../../scripts/demo/apply'
import { DemoPayment, planDemoData } from '../../scripts/demo/plan'
import { prisma } from '../support/database'

const now = new Date('2026-09-23T12:00:00.000Z')

describe('demo seed (integration)', () => {
	let client: Client

	beforeEach(async () => {
		client = new Client({ connectionString: process.env.DATABASE_URL })
		await client.connect()
	})

	afterEach(async () => {
		await client.end()
	})

	test('writes the whole plan and leaves the ledger invariants intact', async () => {
		const plan = planDemoData({ now })

		const result = await applyDemoSeed(client, plan)

		expect(await findInvariantViolations(client)).toEqual([])
		expect(result.merchants.map((merchant) => merchant.name)).toEqual(['Demo Store', 'Demo Rival'])
		expect(await prisma.merchant.count()).toBe(2)
		expect(await prisma.account.count({ where: { kind: 'WALLET' } })).toBe(plan.wallets.length)
		expect(await prisma.payment.count()).toBe(plan.events.length)
		expect(await prisma.payment.count({ where: { status: 'FAILED' } })).toBe(
			plan.events.filter((event) => event.kind === 'PAYMENT' && event.status === 'FAILED').length,
		)
		// A failed Payment has no ledger fact; every settled one has exactly one.
		expect(
			await prisma.payment.count({
				where: { status: 'FAILED', ledgerTransactionId: { not: null } },
			}),
		).toBe(0)
		expect(
			await prisma.payment.count({ where: { status: 'SUCCEEDED', ledgerTransactionId: null } }),
		).toBe(0)
	})

	test('every printed API key authenticates its own Merchant', async () => {
		const result = await applyDemoSeed(client, planDemoData({ now }))
		const authenticate = new AuthenticateMerchantUseCase(
			new PrismaApiKeysRepository(prisma as unknown as PrismaService),
		)

		for (const merchant of result.merchants) {
			const outcome = await authenticate.execute({ apiKey: merchant.apiKey })

			expect(outcome.isRight() && outcome.value.merchantId).toBe(merchant.id)
		}
	})

	test('refuses a second run and writes nothing', async () => {
		await applyDemoSeed(client, planDemoData({ now }))
		const before = await prisma.payment.count()

		await expect(applyDemoSeed(client, planDemoData({ now }))).rejects.toBeInstanceOf(
			DemoAlreadySeededError,
		)

		expect(await prisma.payment.count()).toBe(before)
		expect(await prisma.merchant.count()).toBe(2)
	})

	test('rolls everything back when the plan cannot be written', async () => {
		const plan = planDemoData({ now })
		// A Payment from a Wallet that does not exist breaks the run after most rows are written.
		const ghost: DemoPayment = {
			kind: 'PAYMENT',
			source: 'ghost',
			destination: plan.wallets[0].key,
			amount: 100,
			status: 'FAILED',
			at: now,
		}
		const broken = { ...plan, events: [...plan.events, ghost] }

		await expect(applyDemoSeed(client, broken)).rejects.toThrow()

		expect(await prisma.merchant.count()).toBe(0)
		expect(await prisma.payment.count()).toBe(0)
	})
})
