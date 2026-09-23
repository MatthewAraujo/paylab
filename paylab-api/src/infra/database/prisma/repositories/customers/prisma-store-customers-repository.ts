import {
	ListStoreCustomersByStoreFilters,
	PaginatedStoreCustomers,
	StoreCustomersRepository,
} from '@/domain/quintalpet/application/repositories/store-customers-repository'
import { StoreCustomerConflictError } from '@/domain/quintalpet/application/use-cases/errors/store-customer-conflict-error'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import {
	PrismaStoreCustomerAggregate,
	PrismaStoreCustomerMapper,
} from '@/infra/database/prisma/mappers/prisma-store-customer-mapper'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { Prisma } from '@prisma/client'

const storeCustomerInclude = {
	addresses: true,
}

@Injectable()
export class PrismaStoreCustomersRepository implements StoreCustomersRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(storeCustomerId: string, storeId: string): Promise<StoreCustomer | null> {
		const record = await this.prisma.storeCustomer.findFirst({
			where: { id: storeCustomerId, storeId },
			include: storeCustomerInclude,
		})

		return record
			? PrismaStoreCustomerMapper.toDomain(record as PrismaStoreCustomerAggregate)
			: null
	}

	async findByStoreAndCustomerProfile(
		storeId: string,
		customerProfileId: string,
	): Promise<StoreCustomer | null> {
		const record = await this.prisma.storeCustomer.findUnique({
			where: { storeId_customerProfileId: { storeId, customerProfileId } },
			include: storeCustomerInclude,
		})

		return record
			? PrismaStoreCustomerMapper.toDomain(record as PrismaStoreCustomerAggregate)
			: null
	}

	async listByStore(
		storeId: string,
		filters: ListStoreCustomersByStoreFilters,
	): Promise<PaginatedStoreCustomers> {
		const where: Prisma.StoreCustomerWhereInput = {
			storeId,
			...(filters.status ? { status: filters.status } : {}),
		}

		const [records, total] = await Promise.all([
			this.prisma.storeCustomer.findMany({
				where,
				include: storeCustomerInclude,
				skip: (filters.page - 1) * filters.perPage,
				take: filters.perPage,
				orderBy: { createdAt: 'desc' },
			}),
			this.prisma.storeCustomer.count({ where }),
		])

		return {
			items: records.map((record) =>
				PrismaStoreCustomerMapper.toDomain(record as PrismaStoreCustomerAggregate),
			),
			total,
		}
	}

	async save(storeCustomer: StoreCustomer, tx?: Prisma.TransactionClient): Promise<void> {
		const data = PrismaStoreCustomerMapper.toPrisma(storeCustomer)
		const addressIds = storeCustomer.addresses.map((address) => address.id.toString())

		const run = async (client: Prisma.TransactionClient | PrismaService) => {
			await client.storeCustomer.upsert({
				where: { id: data.id },
				create: data,
				update: {
					name: data.name,
					email: data.email,
					phone: data.phone,
					status: data.status,
					totalOrders: data.totalOrders,
					totalSpentCents: data.totalSpentCents,
					lastOrderAt: data.lastOrderAt,
					updatedAt: data.updatedAt,
				},
			})

			await client.storeCustomerAddress.deleteMany({
				where: {
					storeCustomerId: storeCustomer.id.toString(),
					id: { notIn: addressIds },
				},
			})

			for (const address of storeCustomer.addresses) {
				const addressData = PrismaStoreCustomerMapper.addressToPrisma(
					address,
					storeCustomer.id.toString(),
				)
				await client.storeCustomerAddress.upsert({
					where: { id: addressData.id },
					create: addressData,
					update: addressData,
				})
			}
		}

		try {
			if (tx) {
				await run(tx)
			} else {
				await this.prisma.$transaction((transaction) => run(transaction))
			}
		} catch (error) {
			if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
				throw new StoreCustomerConflictError(
					'A store customer already exists for this store and customer profile.',
				)
			}
			throw error
		}
	}
}
