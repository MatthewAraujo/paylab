import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { AddFavoriteProductUseCase } from '@/domain/quintalpet/application/use-cases/add-favorite-product'
import {
	AddStoreCustomerAddressInput,
	AddStoreCustomerAddressUseCase,
} from '@/domain/quintalpet/application/use-cases/add-store-customer-address'
import { GetFavoriteProductSlugsUseCase } from '@/domain/quintalpet/application/use-cases/get-favorite-product-slugs'
import { GetOrCreateStoreCustomerUseCase } from '@/domain/quintalpet/application/use-cases/get-or-create-store-customer'
import { RemoveFavoriteProductUseCase } from '@/domain/quintalpet/application/use-cases/remove-favorite-product'
import { RemoveStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/remove-store-customer-address'
import { ReplaceFavoriteProductSlugsUseCase } from '@/domain/quintalpet/application/use-cases/replace-favorite-product-slugs'
import { SetDefaultStoreCustomerAddressUseCase } from '@/domain/quintalpet/application/use-cases/set-default-store-customer-address'
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
import { CustomerOnly } from '@/infra/better-auth/decorators'
import { throwTranslatedDomainError } from '@/infra/http/error-translation/throw-translated-domain-error'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	NotFoundException,
	Param,
	Patch,
	Post,
	Put,
	Req,
} from '@nestjs/common'
import { z } from 'zod'

const updateProfileBodySchema = z.object({
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

const replaceFavoritesBodySchema = z.object({
	productSlugs: z.array(z.string().min(1)),
})

type UpdateProfileBody = z.infer<typeof updateProfileBodySchema>
type AddressBody = z.infer<typeof addressBodySchema>
type UpdateAddressBody = z.infer<typeof updateAddressBodySchema>
type ReplaceFavoritesBody = z.infer<typeof replaceFavoritesBodySchema>

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
		name: storeCustomer.name,
		email: storeCustomer.email,
		phone: storeCustomer.phone,
		addresses: storeCustomer.addresses.map(presentAddress),
	}
}

@CustomerOnly()
@Controller('/api/v1/stores/:storeSlug/account')
export class AccountSelfServiceController {
	constructor(
		private readonly storesRepository: StoresRepository,
		private readonly getOrCreateStoreCustomerUseCase: GetOrCreateStoreCustomerUseCase,
		private readonly updateStoreCustomerContactUseCase: UpdateStoreCustomerContactUseCase,
		private readonly addStoreCustomerAddressUseCase: AddStoreCustomerAddressUseCase,
		private readonly updateStoreCustomerAddressUseCase: UpdateStoreCustomerAddressUseCase,
		private readonly removeStoreCustomerAddressUseCase: RemoveStoreCustomerAddressUseCase,
		private readonly setDefaultStoreCustomerAddressUseCase: SetDefaultStoreCustomerAddressUseCase,
		private readonly getFavoriteProductSlugsUseCase: GetFavoriteProductSlugsUseCase,
		private readonly replaceFavoriteProductSlugsUseCase: ReplaceFavoriteProductSlugsUseCase,
		private readonly addFavoriteProductUseCase: AddFavoriteProductUseCase,
		private readonly removeFavoriteProductUseCase: RemoveFavoriteProductUseCase,
	) {}

	@Get('/profile')
	async getProfile(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)
		return presentStoreCustomer(storeCustomer)
	}

	@Patch('/profile')
	async updateProfile(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Body(new ZodValidationPipe(updateProfileBodySchema)) body: UpdateProfileBody,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		try {
			const updated = await this.updateStoreCustomerContactUseCase.execute(
				storeCustomer.storeId.toString(),
				storeCustomer.id.toString(),
				body as UpdateStoreCustomerContactInput,
			)
			return presentStoreCustomer(updated)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/addresses')
	@HttpCode(201)
	async addAddress(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Body(new ZodValidationPipe(addressBodySchema)) body: AddressBody,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		try {
			const result = await this.addStoreCustomerAddressUseCase.execute(
				storeCustomer.storeId.toString(),
				storeCustomer.id.toString(),
				body as AddStoreCustomerAddressInput,
			)
			return presentStoreCustomer(result.storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Patch('/addresses/:addressId')
	async updateAddress(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@UuidParam('addressId') addressId: string,
		@Body(new ZodValidationPipe(updateAddressBodySchema)) body: UpdateAddressBody,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		try {
			const result = await this.updateStoreCustomerAddressUseCase.execute(
				storeCustomer.storeId.toString(),
				storeCustomer.id.toString(),
				addressId,
				body as UpdateStoreCustomerAddressInput,
			)
			return presentStoreCustomer(result.storeCustomer)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Delete('/addresses/:addressId')
	async removeAddress(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@UuidParam('addressId') addressId: string,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		try {
			const updated = await this.removeStoreCustomerAddressUseCase.execute(
				storeCustomer.storeId.toString(),
				storeCustomer.id.toString(),
				addressId,
			)
			return presentStoreCustomer(updated)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Post('/addresses/:addressId/default')
	@HttpCode(200)
	async setDefaultAddress(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@UuidParam('addressId') addressId: string,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		try {
			const updated = await this.setDefaultStoreCustomerAddressUseCase.execute(
				storeCustomer.storeId.toString(),
				storeCustomer.id.toString(),
				addressId,
			)
			return presentStoreCustomer(updated)
		} catch (error) {
			throwTranslatedDomainError(error)
		}
	}

	@Get('/favorites')
	async getFavorites(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		const productSlugs = await this.getFavoriteProductSlugsUseCase.execute(
			storeCustomer.storeId.toString(),
			storeCustomer.id.toString(),
		)
		return { productSlugs }
	}

	@Put('/favorites')
	async replaceFavorites(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Body(new ZodValidationPipe(replaceFavoritesBodySchema)) body: ReplaceFavoritesBody,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		await this.replaceFavoriteProductSlugsUseCase.execute(
			storeCustomer.storeId.toString(),
			storeCustomer.id.toString(),
			body.productSlugs,
		)

		const productSlugs = await this.getFavoriteProductSlugsUseCase.execute(
			storeCustomer.storeId.toString(),
			storeCustomer.id.toString(),
		)
		return { productSlugs }
	}

	@Post('/favorites/:productSlug')
	@HttpCode(201)
	async addFavorite(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Param('productSlug') productSlug: string,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		try {
			await this.addFavoriteProductUseCase.execute(
				storeCustomer.storeId.toString(),
				storeCustomer.id.toString(),
				productSlug,
			)
		} catch (error) {
			throwTranslatedDomainError(error)
		}

		return { productSlug }
	}

	@Delete('/favorites/:productSlug')
	@HttpCode(200)
	async removeFavorite(
		@Req() request: { user?: { id?: string; name?: string; email?: string } },
		@Param('storeSlug') storeSlug: string,
		@Param('productSlug') productSlug: string,
	) {
		const storeCustomer = await this.provisionMyStoreCustomer(request, storeSlug)

		await this.removeFavoriteProductUseCase.execute(
			storeCustomer.storeId.toString(),
			storeCustomer.id.toString(),
			productSlug,
		)

		return { productSlug }
	}

	private async provisionMyStoreCustomer(
		request: { user?: { id?: string; name?: string; email?: string } },
		storeSlug: string,
	): Promise<StoreCustomer> {
		const store = await this.storesRepository.findBySlug(storeSlug)
		if (!store) {
			throw new NotFoundException('Store not found.')
		}

		const customerProfileId = request.user?.id
		if (!customerProfileId || !request.user?.email || !request.user?.name) {
			throw new NotFoundException('Store not found.')
		}

		return this.getOrCreateStoreCustomerUseCase.execute(store.id, customerProfileId, {
			email: request.user.email,
			name: request.user.name,
		})
	}
}
