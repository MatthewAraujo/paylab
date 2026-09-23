import {
	AddStoreCustomerAddressInput,
	AddStoreCustomerAddressUseCase,
} from '@/domain/quintalpet/application/use-cases/add-store-customer-address'
import { GetStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/get-store-customer'
import { ListStoreCustomersUseCase } from '@/domain/quintalpet/application/use-cases/list-store-customers'
import { ReactivateStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/reactivate-store-customer'
import { RemoveStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/remove-store-customer-address'
import { SetDefaultStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/set-default-store-customer-address'
import { SuspendStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/suspend-store-customer'
import {
	UpdateStoreCustomerAddressInput,
	UpdateStoreCustomerAddressUseCase,
} from '@/domain/quintalpet/application/use-cases/update-store-customer-address'
import {
	UpdateStoreCustomerContactInput,
	UpdateStoreCustomerContactUseCase,
} from '@/domain/quintalpet/application/use-cases/update-store-customer-contact'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { StoreCustomerStatus } from '@/domain/quintalpet/enterprise/types/store-customer-status'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { parsePaginationQuery } from '@/infra/http/pipes/pagination-query'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	BadRequestException,
	Body,
	Controller,
	Delete,
	ForbiddenException,
	Get,
	HttpCode,
	Patch,
	Post,
	Query,
	Req,
} from '@nestjs/common'
import { z } from 'zod'

const updateContactBodySchema = z.object({
	name: z.string().min(1).optional().nullable(),
	phone: z.string().min(1).optional().nullable(),
})

const addressBodySchema = z.object({
	street: z.string().min(1),
	number: z.string().min(1),
	complement: z.string().optional().nullable(),
	neighborhood: z.string().min(1),
	city: z.string().min(1),
	state: z.string().min(1),
	postalCode: z.string().regex(/^\d{5}-?\d{3}$/, 'postalCode must be a valid Brazilian CEP'),
	isDefault: z.boolean().optional(),
})

const updateAddressBodySchema = addressBodySchema.partial()

type UpdateContactBody = z.infer<typeof updateContactBodySchema>
type AddressBody = z.infer<typeof addressBodySchema>
type UpdateAddressBody = z.infer<typeof updateAddressBodySchema>

function presentAddress(address: StoreCustomerAddress) {
	return {
		id: address.id.toString(),
		street: address.street,
		number: address.number,
		complement: address.complement,
		neighborhood: address.neighborhood,
		city: address.city,
		state: address.state,
		postalCode: address.postalCode,
		isDefault: address.isDefault,
		createdAt: address.createdAt.toISOString(),
	}
}

function presentStoreCustomer(storeCustomer: StoreCustomer) {
	return {
		id: storeCustomer.id.toString(),
		storeId: storeCustomer.storeId.toString(),
		customerProfileId: storeCustomer.customerProfileId,
		name: storeCustomer.name,
		email: storeCustomer.email,
		phone: storeCustomer.phone,
		status: storeCustomer.status,
		addresses: storeCustomer.addresses.map(presentAddress),
		totalOrders: storeCustomer.totalOrders,
		totalSpentCents: storeCustomer.totalSpentCents,
		lastOrderAt: storeCustomer.lastOrderAt ? storeCustomer.lastOrderAt.toISOString() : null,
		createdAt: storeCustomer.createdAt.toISOString(),
		updatedAt: storeCustomer.updatedAt ? storeCustomer.updatedAt.toISOString() : null,
	}
}

@StoreMemberOnly()
@Controller('/api/v1/admin/stores/:storeId/customers')
export class CustomersAdminController {
	constructor(
		private readonly listStoreCustomersUseCase: ListStoreCustomersUseCase,
		private readonly getStoreCustomerUseCase: GetStoreCustomerUseCase,
		private readonly updateStoreCustomerContactUseCase: UpdateStoreCustomerContactUseCase,
		private readonly addStoreCustomerAddressUseCase: AddStoreCustomerAddressUseCase,
		private readonly updateStoreCustomerAddressUseCase: UpdateStoreCustomerAddressUseCase,
		private readonly removeStoreCustomerAddressUseCase: RemoveStoreCustomerAddressUseCase,
		private readonly setDefaultStoreCustomerAddressUseCase: SetDefaultStoreCustomerAddressUseCase,
		private readonly suspendStoreCustomerUseCase: SuspendStoreCustomerUseCase,
		private readonly reactivateStoreCustomerUseCase: ReactivateStoreCustomerUseCase,
	) {}

	@Get()
	async list(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@Query('status') status?: string,
		@Query('page') page?: string,
		@Query('perPage') perPage?: string,
	) {
		this.assertStoreAccess(request, storeId)

		const pagination = parsePaginationQuery({ page, perPage })
		const result = await this.listStoreCustomersUseCase.execute(storeId, {
			status: this.parseStatus(status),
			page: pagination.page,
			perPage: pagination.perPage,
		})

		return {
			items: result.items.map(presentStoreCustomer),
			total: result.total,
		}
	}

	@Get('/:customerId')
	async get(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
	) {
		this.assertStoreAccess(request, storeId)

		const storeCustomer = await this.getStoreCustomerUseCase.execute(storeId, customerId)
		return presentStoreCustomer(storeCustomer)
	}

	@Patch('/:customerId')
	async updateContact(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
		@Body(new ZodValidationPipe(updateContactBodySchema)) body: UpdateContactBody,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const storeCustomer = await this.updateStoreCustomerContactUseCase.execute(
				storeId,
				customerId,
				body as UpdateStoreCustomerContactInput,
			)
			return presentStoreCustomer(storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:customerId/addresses')
	@HttpCode(201)
	async addAddress(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
		@Body(new ZodValidationPipe(addressBodySchema)) body: AddressBody,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const result = await this.addStoreCustomerAddressUseCase.execute(
				storeId,
				customerId,
				body as AddStoreCustomerAddressInput,
			)
			return presentStoreCustomer(result.storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Patch('/:customerId/addresses/:addressId')
	async updateAddress(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
		@UuidParam('addressId') addressId: string,
		@Body(new ZodValidationPipe(updateAddressBodySchema)) body: UpdateAddressBody,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const result = await this.updateStoreCustomerAddressUseCase.execute(
				storeId,
				customerId,
				addressId,
				body as UpdateStoreCustomerAddressInput,
			)
			return presentStoreCustomer(result.storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Delete('/:customerId/addresses/:addressId')
	async removeAddress(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
		@UuidParam('addressId') addressId: string,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const storeCustomer = await this.removeStoreCustomerAddressUseCase.execute(
				storeId,
				customerId,
				addressId,
			)
			return presentStoreCustomer(storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:customerId/addresses/:addressId/default')
	@HttpCode(200)
	async setDefaultAddress(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
		@UuidParam('addressId') addressId: string,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const storeCustomer = await this.setDefaultStoreCustomerAddressUseCase.execute(
				storeId,
				customerId,
				addressId,
			)
			return presentStoreCustomer(storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:customerId/suspend')
	@HttpCode(200)
	async suspend(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const storeCustomer = await this.suspendStoreCustomerUseCase.execute(storeId, customerId)
			return presentStoreCustomer(storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/:customerId/reactivate')
	@HttpCode(200)
	async reactivate(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('customerId') customerId: string,
	) {
		this.assertStoreAccess(request, storeId)

		try {
			const storeCustomer = await this.reactivateStoreCustomerUseCase.execute(storeId, customerId)
			return presentStoreCustomer(storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	private assertStoreAccess(request: { accessibleStores?: string[] }, storeId: string) {
		const accessibleStores = request.accessibleStores ?? []
		if (!accessibleStores.includes(storeId)) {
			throw new ForbiddenException('You do not have access to this store.')
		}
	}

	private parseStatus(status?: string): StoreCustomerStatus | undefined {
		if (!status) return undefined
		if (!Object.values(StoreCustomerStatus).includes(status as StoreCustomerStatus)) {
			throw new BadRequestException('Invalid status filter.')
		}
		return status as StoreCustomerStatus
	}
}
