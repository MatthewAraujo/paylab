import { Prisma } from '@prisma/client'
import { StoreCustomer } from '../../enterprise/entities/store-customer'
import { StoreCustomerStatus } from '../../enterprise/types/store-customer-status'

export interface ListStoreCustomersByStoreFilters {
	status?: StoreCustomerStatus
	page: number
	perPage: number
}

export interface PaginatedStoreCustomers {
	items: StoreCustomer[]
	total: number
}

export abstract class StoreCustomersRepository {
	abstract findById(storeCustomerId: string, storeId: string): Promise<StoreCustomer | null>
	abstract findByStoreAndCustomerProfile(
		storeId: string,
		customerProfileId: string,
	): Promise<StoreCustomer | null>
	abstract listByStore(
		storeId: string,
		filters: ListStoreCustomersByStoreFilters,
	): Promise<PaginatedStoreCustomers>
	abstract save(storeCustomer: StoreCustomer, tx?: Prisma.TransactionClient): Promise<void>
}
