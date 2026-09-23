import { Injectable } from '@nestjs/common'
import {
	KeysetPosition,
	PaymentListFilter,
	PaymentListItem,
	ReadQueriesRepository,
} from '../repositories/read-queries-repository'
import { KeysetPage, fetchSize, toKeysetPage } from '../services/keyset-page'

interface ListPaymentsUseCaseRequest extends PaymentListFilter {
	merchantId: string
	pageSize: number
	after?: KeysetPosition
}

/**
 * The caller's own Payments, newest first. The Merchant predicate is always applied, so an
 * Account filter can only narrow the caller's Payments, never reveal anyone else's.
 */
@Injectable()
export class ListPaymentsUseCase {
	constructor(private readQueries: ReadQueriesRepository) {}

	async execute({
		pageSize,
		...query
	}: ListPaymentsUseCaseRequest): Promise<KeysetPage<PaymentListItem>> {
		const rows = await this.readQueries.listPayments({ ...query, fetch: fetchSize(pageSize) })

		return toKeysetPage(rows, pageSize)
	}
}
