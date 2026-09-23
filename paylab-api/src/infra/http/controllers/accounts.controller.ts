import { CreateWalletUseCase } from '@/domain/paylab/application/use-cases/create-wallet'
import { GetAccountUseCase } from '@/domain/paylab/application/use-cases/get-account'
import { GetAccountBalanceUseCase } from '@/domain/paylab/application/use-cases/get-account-balance'
import { ListAccountEntriesUseCase } from '@/domain/paylab/application/use-cases/list-account-entries'
import { ApiKeyGuard } from '@/infra/auth/api-key.guard'
import { CurrentMerchant, MerchantContext } from '@/infra/auth/current-merchant.decorator'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { cursorSchema, limitSchema } from '@/infra/http/pagination/query-schemas'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { Controller, Get, HttpCode, Param, Post, Query, UseGuards } from '@nestjs/common'
import { z } from 'zod'
import { AccountPresenter } from '../presenters/account-presenter'
import { KeysetPagePresenter } from '../presenters/keyset-page-presenter'

const accountIdSchema = z.string().uuid()
const accountIdPipe = new ZodValidationPipe(accountIdSchema)

// Cursor-only keyset pagination: unknown parameters (offset, page) are rejected.
const entriesQuerySchema = z
	.object({ limit: limitSchema, cursor: cursorSchema.optional() })
	.strict()
const entriesQueryPipe = new ZodValidationPipe(entriesQuerySchema)
type EntriesQuery = z.infer<typeof entriesQuerySchema>

@Controller('v1/accounts')
@UseGuards(ApiKeyGuard)
export class AccountsController {
	constructor(
		private createWallet: CreateWalletUseCase,
		private getAccount: GetAccountUseCase,
		private getAccountBalance: GetAccountBalanceUseCase,
		private listAccountEntries: ListAccountEntriesUseCase,
	) {}

	// No body is read: the API only ever creates a BRL Wallet for the authenticated
	// Merchant, so a caller cannot ask for another kind, currency or owner.
	@Post()
	@HttpCode(201)
	async create(@CurrentMerchant() merchant: MerchantContext) {
		const result = await this.createWallet.execute({ merchantId: merchant.id })

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		return AccountPresenter.toHTTP(result.value.account)
	}

	@Get(':id')
	async get(@CurrentMerchant() merchant: MerchantContext, @Param('id', accountIdPipe) id: string) {
		const result = await this.getAccount.execute({ merchantId: merchant.id, accountId: id })

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		return AccountPresenter.toHTTP(result.value.account)
	}

	@Get(':id/balance')
	async balance(
		@CurrentMerchant() merchant: MerchantContext,
		@Param('id', accountIdPipe) id: string,
	) {
		const result = await this.getAccountBalance.execute({ merchantId: merchant.id, accountId: id })

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		return AccountPresenter.balanceToHTTP(id, result.value.balance, result.value.currency)
	}

	// Ledger Entry history, newest first (created time desc, then id desc).
	@Get(':id/entries')
	async entries(
		@CurrentMerchant() merchant: MerchantContext,
		@Param('id', accountIdPipe) id: string,
		@Query(entriesQueryPipe) query: EntriesQuery,
	) {
		const result = await this.listAccountEntries.execute({
			merchantId: merchant.id,
			accountId: id,
			pageSize: query.limit,
			after: query.cursor,
		})

		if (result.isLeft()) {
			throwTranslatedDomainError(result.value)
		}

		return KeysetPagePresenter.toHTTP(result.value, AccountPresenter.entryToHTTP)
	}
}
