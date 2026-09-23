import { AccountsRepository } from '@/domain/paylab/application/repositories/accounts-repository'
import { Account } from '@/domain/paylab/enterprise/entities/account'
import { Injectable } from '@nestjs/common'
import { accountToDomain, accountToPrisma } from '../mappers/account-mapper'
import { balanceToNumber } from '../mappers/money-mapper'
import { PrismaService } from '../prisma.service'

@Injectable()
export class PrismaAccountsRepository implements AccountsRepository {
	constructor(private prisma: PrismaService) {}

	async findById(id: string): Promise<Account | null> {
		const row = await this.prisma.account.findUnique({ where: { id } })

		return row ? accountToDomain(row) : null
	}

	async findClearingAccount(currency: string): Promise<Account | null> {
		const row = await this.prisma.account.findFirst({
			where: { kind: 'EXTERNAL_CLEARING', currency },
		})

		return row ? accountToDomain(row) : null
	}

	async create(account: Account): Promise<void> {
		await this.prisma.account.create({ data: accountToPrisma(account) })
	}

	// The Balance is credits minus debits over the ledger, computed on every call.
	// There is no stored balance column to drift.
	async getBalance(accountId: string): Promise<number> {
		const [{ balance }] = await this.prisma.$queryRaw<{ balance: bigint }[]>`
			SELECT coalesce(sum(CASE direction WHEN 'CREDIT' THEN amount ELSE -amount END), 0)::bigint AS balance
			FROM ledger_entries
			WHERE account_id = ${accountId}::uuid`

		return balanceToNumber(balance)
	}
}
