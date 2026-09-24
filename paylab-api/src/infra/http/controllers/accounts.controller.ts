import { CreateWalletUseCase } from '@/domain/paylab/application/use-cases/create-wallet'
import { GetAccountUseCase } from '@/domain/paylab/application/use-cases/get-account'
import { GetAccountBalanceUseCase } from '@/domain/paylab/application/use-cases/get-account-balance'
import { ListAccountEntriesUseCase } from '@/domain/paylab/application/use-cases/list-account-entries'
import { ListAccountsUseCase } from '@/domain/paylab/application/use-cases/list-accounts'
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
const pageQuerySchema = z.object({ limit: limitSchema, cursor: cursorSchema.optional() }).strict()
const pageQueryPipe = new ZodValidationPipe(pageQuerySchema)
type PageQuery = z.infer<typeof pageQuerySchema>

@Controller('v1/accounts')
@UseGuards(ApiKeyGuard)
export class AccountsController {
	constructor(
		private createWallet: CreateWalletUseCase,
		private getAccount: GetAccountUseCase,
		private getAccountBalance: GetAccountBalanceUseCase,
		private listAccountEntries: ListAccountEntriesUseCase,
		private listAccounts: ListAccountsUseCase,
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

	// The caller's Wallets, newest first. Declared before `:id` only for readability;
	// the two routes cannot collide because `:id` is never an empty segment.
	@Get()
	async list(@CurrentMerchant() merchant: MerchantContext, @Query(pageQueryPipe) query: PageQuery) {
		const page = await this.listAccounts.execute({
			merchantId: merchant.id,
			pageSize: query.limit,
			after: query.cursor,
		})

		return KeysetPagePresenter.toHTTP(page, AccountPresenter.walletToHTTP)
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
		@Query(pageQueryPipe) query: PageQuery,
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
