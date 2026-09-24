import { Injectable } from '@nestjs/common'
import {
	KeysetPosition,
	ReadQueriesRepository,
	WalletListItem,
} from '../repositories/read-queries-repository'
import { KeysetPage, fetchSize, toKeysetPage } from '../services/keyset-page'

interface ListAccountsUseCaseRequest {
	merchantId: string
	pageSize: number
	after?: KeysetPosition
}

/** The caller's own Wallets, newest first. The External Clearing Account is never listed. */
@Injectable()
export class ListAccountsUseCase {
	constructor(private readQueries: ReadQueriesRepository) {}

	async execute({
		merchantId,
		pageSize,
		after,
	}: ListAccountsUseCaseRequest): Promise<KeysetPage<WalletListItem>> {
		const rows = await this.readQueries.listWallets({
			merchantId,
			after,
			fetch: fetchSize(pageSize),
		})

		return toKeysetPage(rows, pageSize)
	}
}
