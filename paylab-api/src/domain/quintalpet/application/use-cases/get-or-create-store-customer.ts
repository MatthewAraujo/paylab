import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'
import { CRMProfile } from '../../enterprise/entities/crm-profile'
import { StoreCustomer } from '../../enterprise/entities/store-customer'
import { InvalidStoreCustomerTransitionError } from '../../enterprise/errors/invalid-store-customer-transition-error'
import { StoreCustomerAddressNotFoundError } from '../../enterprise/errors/store-customer-address-not-found-error'
import { CRMRepository } from '../repositories/crm-repository'
import { StoreCustomersRepository } from '../repositories/store-customers-repository'
import { StoreCustomerConflictError } from './errors/store-customer-conflict-error'

export interface GetOrCreateStoreCustomerContact {
	email: string
	name?: string | null
}

@Injectable()
export class GetOrCreateStoreCustomerUseCase {
	constructor(
		private readonly prisma: PrismaService,
		private readonly storeCustomersRepository: StoreCustomersRepository,
		private readonly crmRepository: CRMRepository,
	) {}

	async execute(
		storeId: string,
		customerProfileId: string,
		contact: GetOrCreateStoreCustomerContact,
	): Promise<StoreCustomer> {
		const existing = await this.storeCustomersRepository.findByStoreAndCustomerProfile(
			storeId,
			customerProfileId,
		)
		if (existing) return existing

		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID(storeId),
			customerProfileId,
			email: contact.email,
			name: contact.name ?? null,
		})
		const crmProfile = CRMProfile.create({ storeCustomerId: storeCustomer.id })

		try {
			await this.prisma.$transaction(async (tx) => {
				await this.storeCustomersRepository.save(storeCustomer, tx)
				await this.crmRepository.save(crmProfile, tx)
			})
		} catch (error) {
			if (error instanceof StoreCustomerConflictError) {
				const racedWinner = await this.storeCustomersRepository.findByStoreAndCustomerProfile(
					storeId,
					customerProfileId,
				)
				if (racedWinner) return racedWinner
			}
			throw error
		}

		return storeCustomer
	}
}

export function isCustomersDomainError(error: unknown) {
	return (
		error instanceof InvalidStoreCustomerTransitionError ||
		error instanceof StoreCustomerAddressNotFoundError ||
		error instanceof StoreCustomerConflictError
	)
}
