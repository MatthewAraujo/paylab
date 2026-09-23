import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { StoreCustomerStatus } from '@/domain/quintalpet/enterprise/types/store-customer-status'
import { Prisma } from '@prisma/client'

export type PrismaStoreCustomerAggregate = Prisma.StoreCustomerGetPayload<{
	include: { addresses: true }
}>

export class PrismaStoreCustomerMapper {
	static toDomain(raw: PrismaStoreCustomerAggregate): StoreCustomer {
		return StoreCustomer.create(
			{
				storeId: new UniqueEntityID(raw.storeId),
				customerProfileId: raw.customerProfileId,
				name: raw.name,
				email: raw.email,
				phone: raw.phone,
				status: raw.status as StoreCustomerStatus,
				addresses: raw.addresses.map((address) =>
					StoreCustomerAddress.create(
						{
							storeCustomerId: new UniqueEntityID(raw.id),
							street: address.street,
							number: address.number,
							complement: address.complement,
							neighborhood: address.neighborhood,
							city: address.city,
							state: address.state,
							postalCode: address.postalCode,
							isDefault: address.isDefault,
							createdAt: address.createdAt,
						},
						new UniqueEntityID(address.id),
					),
				),
				totalOrders: raw.totalOrders,
				totalSpentCents: raw.totalSpentCents,
				lastOrderAt: raw.lastOrderAt,
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(storeCustomer: StoreCustomer): Prisma.StoreCustomerUncheckedCreateInput {
		return {
			id: storeCustomer.id.toString(),
			storeId: storeCustomer.storeId.toString(),
			customerProfileId: storeCustomer.customerProfileId,
			name: storeCustomer.name,
			email: storeCustomer.email,
			phone: storeCustomer.phone,
			status: storeCustomer.status,
			totalOrders: storeCustomer.totalOrders,
			totalSpentCents: storeCustomer.totalSpentCents,
			lastOrderAt: storeCustomer.lastOrderAt,
			createdAt: storeCustomer.createdAt,
			updatedAt: storeCustomer.updatedAt ?? undefined,
		}
	}

	static addressToPrisma(
		address: StoreCustomerAddress,
		storeCustomerId: string,
	): Prisma.StoreCustomerAddressUncheckedCreateInput {
		return {
			id: address.id.toString(),
			storeCustomerId,
			street: address.street,
			number: address.number,
			complement: address.complement,
			neighborhood: address.neighborhood,
			city: address.city,
			state: address.state,
			postalCode: address.postalCode,
			isDefault: address.isDefault,
			createdAt: address.createdAt,
		}
	}
}
