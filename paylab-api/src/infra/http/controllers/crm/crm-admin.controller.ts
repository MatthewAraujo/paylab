import { AddCRMTagUseCase } from '@/domain/quintalpet/application/use-cases/add-crm-tag'
import { GetCRMProfileUseCase } from '@/domain/quintalpet/application/use-cases/get-crm-profile'
import { ListCRMInteractionsUseCase } from '@/domain/quintalpet/application/use-cases/list-crm-interactions'
import { ListStoreCustomersBySegmentUseCase } from '@/domain/quintalpet/application/use-cases/list-store-customers-by-segment'
import { ListStoreCustomersByTagUseCase } from '@/domain/quintalpet/application/use-cases/list-store-customers-by-tag'
import {
	RecordCRMInteractionInput,
	RecordCRMInteractionUseCase,
} from '@/domain/quintalpet/application/use-cases/record-crm-interaction'
import { RemoveCRMTagUseCase } from '@/domain/quintalpet/application/use-cases/remove-crm-tag'
import { UpdateCRMSegmentUseCase } from '@/domain/quintalpet/application/use-cases/update-crm-segment'
import { CRMInteraction } from '@/domain/quintalpet/enterprise/entities/crm-interaction'
import { CRMProfile } from '@/domain/quintalpet/enterprise/entities/crm-profile'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { CRMInteractionChannel } from '@/domain/quintalpet/enterprise/types/crm-interaction-channel'
import { CRMInteractionType } from '@/domain/quintalpet/enterprise/types/crm-interaction-type'
import { CustomerSegment } from '@/domain/quintalpet/enterprise/types/customer-segment'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { parsePaginationQuery } from '@/infra/http/pipes/pagination-query'
import { UuidParam } from '@/infra/http/pipes/uuid-param.decorator'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import {
	BadRequestException,
	Body,
	Controller,
	ForbiddenException,
	Get,
	HttpCode,
	Post,
	Put,
	Query,
	Req,
} from '@nestjs/common'
import { z } from 'zod'

const updateSegmentBodySchema = z.object({
	segment: z.nativeEnum(CustomerSegment),
})

const updateTagBodySchema = z.object({
	tag: z.string().min(1),
	action: z.enum(['add', 'remove']),
})

const recordInteractionBodySchema = z.object({
	type: z.nativeEnum(CRMInteractionType),
	channel: z.nativeEnum(CRMInteractionChannel),
	subject: z.string().optional().nullable(),
	content: z.string().optional().nullable(),
})

type UpdateSegmentBody = z.infer<typeof updateSegmentBodySchema>
type UpdateTagBody = z.infer<typeof updateTagBodySchema>
type RecordInteractionBody = z.infer<typeof recordInteractionBodySchema>

function presentInteraction(interaction: CRMInteraction) {
	return {
		id: interaction.id.toString(),
		type: interaction.type,
		channel: interaction.channel,
		subject: interaction.subject,
		content: interaction.content,
		createdBy: interaction.createdBy,
		createdAt: interaction.createdAt.toISOString(),
	}
}

function presentCRMProfile(profile: CRMProfile) {
	return {
		id: profile.id.toString(),
		storeCustomerId: profile.storeCustomerId.toString(),
		segment: profile.segment,
		tags: profile.tags,
		notes: profile.notes,
		lastContactAt: profile.lastContactAt ? profile.lastContactAt.toISOString() : null,
	}
}

function presentStoreCustomerSummary(storeCustomer: StoreCustomer) {
	return {
		id: storeCustomer.id.toString(),
		storeId: storeCustomer.storeId.toString(),
		name: storeCustomer.name,
		email: storeCustomer.email,
		phone: storeCustomer.phone,
		status: storeCustomer.status,
	}
}

@StoreMemberOnly()
@Controller('/api/v1/admin/stores/:storeId/crm')
export class CRMAdminController {
	constructor(
		private readonly getCRMProfileUseCase: GetCRMProfileUseCase,
		private readonly updateCRMSegmentUseCase: UpdateCRMSegmentUseCase,
		private readonly addCRMTagUseCase: AddCRMTagUseCase,
		private readonly removeCRMTagUseCase: RemoveCRMTagUseCase,
		private readonly recordCRMInteractionUseCase: RecordCRMInteractionUseCase,
		private readonly listCRMInteractionsUseCase: ListCRMInteractionsUseCase,
		private readonly listStoreCustomersBySegmentUseCase: ListStoreCustomersBySegmentUseCase,
		private readonly listStoreCustomersByTagUseCase: ListStoreCustomersByTagUseCase,
	) {}

	@Put('/profiles/:storeCustomerId/segment')
	async updateSegment(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('storeCustomerId') storeCustomerId: string,
		@Body(new ZodValidationPipe(updateSegmentBodySchema)) body: UpdateSegmentBody,
	) {
		this.assertStoreAccess(request, storeId)

		const profile = await this.updateCRMSegmentUseCase.execute(
			storeId,
			storeCustomerId,
			body.segment,
		)
		return presentCRMProfile(profile)
	}

	@Put('/profiles/:storeCustomerId/tags')
	async updateTag(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('storeCustomerId') storeCustomerId: string,
		@Body(new ZodValidationPipe(updateTagBodySchema)) body: UpdateTagBody,
	) {
		this.assertStoreAccess(request, storeId)

		const profile =
			body.action === 'add'
				? await this.addCRMTagUseCase.execute(storeId, storeCustomerId, body.tag)
				: await this.removeCRMTagUseCase.execute(storeId, storeCustomerId, body.tag)

		return presentCRMProfile(profile)
	}

	@Get('/profiles/:storeCustomerId')
	async getProfile(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('storeCustomerId') storeCustomerId: string,
	) {
		this.assertStoreAccess(request, storeId)

		const profile = await this.getCRMProfileUseCase.execute(storeId, storeCustomerId)
		return presentCRMProfile(profile)
	}

	@Post('/profiles/:storeCustomerId/interactions')
	@HttpCode(201)
	async recordInteraction(
		@Req() request: { accessibleStores?: string[]; user?: { id?: string } },
		@UuidParam('storeId') storeId: string,
		@UuidParam('storeCustomerId') storeCustomerId: string,
		@Body(new ZodValidationPipe(recordInteractionBodySchema)) body: RecordInteractionBody,
	) {
		this.assertStoreAccess(request, storeId)

		const result = await this.recordCRMInteractionUseCase.execute(storeId, storeCustomerId, {
			...body,
			createdBy: request.user?.id ?? null,
		} as RecordCRMInteractionInput)

		return presentInteraction(result.interaction)
	}

	@Get('/profiles/:storeCustomerId/interactions')
	async listInteractions(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@UuidParam('storeCustomerId') storeCustomerId: string,
	) {
		this.assertStoreAccess(request, storeId)

		const interactions = await this.listCRMInteractionsUseCase.execute(storeId, storeCustomerId)
		return { items: interactions.map(presentInteraction) }
	}

	@Get('/customers')
	async listCustomers(
		@Req() request: { accessibleStores?: string[] },
		@UuidParam('storeId') storeId: string,
		@Query('segment') segment?: string,
		@Query('tag') tag?: string,
		@Query('page') page?: string,
		@Query('perPage') perPage?: string,
	) {
		this.assertStoreAccess(request, storeId)

		const pagination = parsePaginationQuery({ page, perPage })

		if (segment) {
			if (!Object.values(CustomerSegment).includes(segment as CustomerSegment)) {
				throw new BadRequestException('Invalid segment filter.')
			}
			const result = await this.listStoreCustomersBySegmentUseCase.execute(
				storeId,
				segment as CustomerSegment,
				pagination,
			)
			return {
				items: result.items.map(presentStoreCustomerSummary),
				total: result.total,
			}
		}

		if (tag) {
			const result = await this.listStoreCustomersByTagUseCase.execute(storeId, tag, pagination)
			return {
				items: result.items.map(presentStoreCustomerSummary),
				total: result.total,
			}
		}

		return { items: [], total: 0 }
	}

	private assertStoreAccess(request: { accessibleStores?: string[] }, storeId: string) {
		const accessibleStores = request.accessibleStores ?? []
		if (!accessibleStores.includes(storeId)) {
			throw new ForbiddenException('You do not have access to this store.')
		}
	}
}
