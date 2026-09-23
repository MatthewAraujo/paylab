import { GetCurrentStoreMemberProfileUseCase } from '@/domain/quintalpet/application/use-cases/get-current-store-member-profile'
import { CurrentStoreId } from '@/infra/better-auth/current-store-id.decorator'
import { StoreMemberOnly } from '@/infra/better-auth/decorators'
import { CurrentAdminProfileResponseDto } from '@/infra/http/presenters/identity/admin-session.dto'
import { Controller, Get, UnauthorizedException } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { Session, UserSession } from '@thallesp/nestjs-better-auth'

@Controller('/api/v1/admin/me')
@ApiTags('Admin Identity')
@StoreMemberOnly()
export class GetCurrentAdminController {
	constructor(private readonly getCurrentStoreMemberProfile: GetCurrentStoreMemberProfileUseCase) {}

	@Get()
	@ApiOperation({ summary: 'Get the current authenticated admin profile' })
	@ApiOkResponse({
		description: 'Current authenticated admin and store summary.',
		type: CurrentAdminProfileResponseDto,
	})
	@ApiUnauthorizedResponse({ description: 'Missing or invalid admin session.' })
	async handle(@Session() session: UserSession, @CurrentStoreId() storeId: string) {
		const profile = await this.getCurrentStoreMemberProfile.execute({
			user: {
				id: session.user.id,
				name: session.user.name,
				email: session.user.email,
			},
			storeId,
		})

		if (!profile) {
			throw new UnauthorizedException('Authenticated admin profile is no longer valid.')
		}

		return profile
	}
}
