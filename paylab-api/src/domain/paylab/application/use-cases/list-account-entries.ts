import { Either, left, right } from '@/core/either'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { Injectable } from '@nestjs/common'
import { AccountsRepository } from '../repositories/accounts-repository'
import {
	KeysetPosition,
	LedgerEntryItem,
	ReadQueriesRepository,
} from '../repositories/read-queries-repository'
import { KeysetPage, fetchSize, toKeysetPage } from '../services/keyset-page'

interface ListAccountEntriesUseCaseRequest {
	merchantId: string
	accountId: string
	pageSize: number
	after?: KeysetPosition
}

type ListAccountEntriesUseCaseResponse = Either<ResourceNotFoundError, KeysetPage<LedgerEntryItem>>

/**
 * A Wallet's Ledger Entry history, newest first. Only the owner may read it; an unknown
 * id, another Merchant's Wallet and the External Clearing Account are the same not-found.
 */
@Injectable()
export class ListAccountEntriesUseCase {
	constructor(
		private accountsRepository: AccountsRepository,
		private readQueries: ReadQueriesRepository,
	) {}

	async execute({
		merchantId,
		accountId,
		pageSize,
		after,
	}: ListAccountEntriesUseCaseRequest): Promise<ListAccountEntriesUseCaseResponse> {
		const account = await this.accountsRepository.findById(accountId)

		if (!account || !account.isWallet() || account.merchantId !== merchantId) {
			return left(new ResourceNotFoundError())
		}

		const rows = await this.readQueries.listEntries({
			accountId,
			after,
			fetch: fetchSize(pageSize),
		})

		return right(toKeysetPage(rows, pageSize))
	}
}
