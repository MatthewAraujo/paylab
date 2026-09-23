import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Account } from '@/domain/paylab/enterprise/entities/account'
import { Prisma, Account as PrismaAccount } from '@prisma/client'

export function accountToDomain(row: PrismaAccount): Account {
	return Account.restore(
		{
			kind: row.kind,
			merchantId: row.merchantId ?? undefined,
			currency: row.currency,
		},
		new UniqueEntityID(row.id),
	)
}

export function accountToPrisma(account: Account): Prisma.AccountUncheckedCreateInput {
	return {
		id: account.id.toString(),
		kind: account.kind,
		merchantId: account.merchantId ?? null,
		currency: account.currency,
	}
}
