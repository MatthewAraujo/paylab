import { Prisma } from '@prisma/client'
import { CRMProfile } from '../../enterprise/entities/crm-profile'
import { StoreCustomer } from '../../enterprise/entities/store-customer'
import { CustomerSegment } from '../../enterprise/types/customer-segment'

export interface Pagination {
	page: number
	perPage: number
}

export interface PaginatedStoreCustomers {
	items: StoreCustomer[]
	total: number
}

export abstract class CRMRepository {
	abstract findByStoreCustomerId(storeCustomerId: string): Promise<CRMProfile | null>
	abstract listStoreCustomersBySegment(
		storeId: string,
		segment: CustomerSegment,
		pagination: Pagination,
	): Promise<PaginatedStoreCustomers>
	abstract listStoreCustomersByTag(
		storeId: string,
		tag: string,
		pagination: Pagination,
	): Promise<PaginatedStoreCustomers>
	abstract save(crmProfile: CRMProfile, tx?: Prisma.TransactionClient): Promise<void>
}
