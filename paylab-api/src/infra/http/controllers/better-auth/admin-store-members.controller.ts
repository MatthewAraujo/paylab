import { randomBytes } from 'node:crypto'
import { BetterAuthService } from '@/infra/better-auth/better-auth.service'
import { PlatformAdminOnly } from '@/infra/better-auth/decorators'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { getFrontendOrigin } from '@/infra/http/frontend-origin'
import { ZodValidationPipe } from '@/infra/http/pipes/zod-validation-pipe'
import { AppLogger } from '@/infra/observability/app-logger'
import {
	Body,
	Controller,
	HttpCode,
	HttpStatus,
	InternalServerErrorException,
	Post,
} from '@nestjs/common'
import { ApiBody, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { Session, UserSession } from '@thallesp/nestjs-better-auth'
import { z } from 'zod'

const createStoreMemberBodySchema = z.object({
	email: z.string().email(),
	storeId: z.string().uuid(),
})

type CreateStoreMemberBody = z.infer<typeof createStoreMemberBodySchema>

class CreateStoreMemberDto {
	email!: string
	storeId!: string
}

class CreateStoreMemberResponseDto {
	success!: boolean
	message!: string
	storeMembers?: { id: string; userId: string; storeId: string; role: string }[]
}

@Controller('/api/v1/admin/store-members')
@PlatformAdminOnly()
export class AdminStoreMembersController {
	constructor(
		private betterAuthService: BetterAuthService,
		private prisma: PrismaService,
		private readonly logger: AppLogger,
	) {}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({
		summary: 'Create a new store member (owner)',
		description: 'Admin endpoint to manually create a store owner account',
	})
	@ApiBody({ type: CreateStoreMemberDto })
	@ApiResponse({
		status: 201,
		description: 'Store member created successfully',
		type: CreateStoreMemberResponseDto,
	})
	async createStoreMember(
		@Body(new ZodValidationPipe(createStoreMemberBodySchema)) dto: CreateStoreMemberBody,
		@Session() session: UserSession,
	): Promise<CreateStoreMemberResponseDto> {
		try {
			// Validate store exists
			const store = await this.prisma.store.findUnique({
				where: { id: dto.storeId },
			})

			if (!store) {
				return {
					success: false,
					message: 'Store not found',
				}
			}

			// Check if user already exists (by email through Better Auth)
			// For now, we'll generate a temporary password and let Better Auth handle user creation
			const tempPassword = this.generateTemporaryPassword()

			// Get Better Auth instance
			const auth = this.betterAuthService.getInstance()

			// Create user in Better Auth
			// Note: This assumes Better Auth API is accessible server-side
			// In production, you may need to use Better Auth's server-side SDK
			const betterAuthUser = await this.createBetterAuthUser(dto.email, tempPassword)

			if (!betterAuthUser) {
				return {
					success: false,
					message: 'Failed to create user in Better Auth',
				}
			}

			// Create StoreMember record in PetAgro
			const storeMember = await this.prisma.storeMember.create({
				data: {
					userId: betterAuthUser.id,
					storeId: dto.storeId,
					role: 'ADMIN', // MVP: all store members are admin
				},
			})

			// Record who provisioned this admin, for audit purposes
			await this.prisma.storeMemberProvisioningLog.create({
				data: {
					storeId: dto.storeId,
					createdUserId: betterAuthUser.id,
					createdEmail: dto.email,
					createdByUserId: session.user.id,
					createdByEmail: session.user.email,
				},
			})

			// Send password reset email via Resend
			// The user will click the reset link to set their own password
			await this.sendPasswordResetEmail(dto.email)

			this.logger.info('security.admin_action', {
				context: 'SecurityAudit',
				action: 'store_member.provisioned',
				storeId: dto.storeId,
				actorUserId: session.user.id,
				createdUserId: betterAuthUser.id,
			})

			return {
				success: true,
				message: `Store member created successfully. Email sent to ${dto.email}`,
				storeMembers: [
					{
						id: storeMember.id,
						userId: storeMember.userId,
						storeId: storeMember.storeId,
						role: storeMember.role,
					},
				],
			}
		} catch (error) {
			// Never echo the raw error back to the client — it can carry DB
			// column names, constraint details, or upstream provider messages.
			this.logger.errorEvent('security.admin_action_failed', {
				context: 'SecurityAudit',
				action: 'store_member.provisioned',
				storeId: dto.storeId,
				actorUserId: session.user.id,
				errorName: error instanceof Error ? error.name : 'UnknownError',
				errorMessage: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new InternalServerErrorException('Failed to create store member.')
		}
	}

	private generateTemporaryPassword(): string {
		// Generate a cryptographically random password
		return randomBytes(16).toString('hex')
	}

	private async createBetterAuthUser(email: string, password: string) {
		const existing = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
			'SELECT id FROM "user" WHERE email = $1',
			email,
		)

		if (existing.length > 0) {
			return { id: existing[0].id }
		}

		const auth = this.betterAuthService.getInstance()
		const response = await auth.api.signUpEmail({
			body: {
				email,
				password,
				name: email.split('@')[0],
			},
		})

		// signUpEmail's create hook always provisions a CustomerProfile — not
		// wanted here, since this account is being provisioned as staff.
		// CustomerProfile and StoreMember/PlatformAdmin are mutually exclusive
		// in the MVP.
		await this.prisma.customerProfile.deleteMany({ where: { userId: response.user.id } })

		return response.user
	}

	private async sendPasswordResetEmail(email: string) {
		const auth = this.betterAuthService.getInstance()
		const frontendUrl = getFrontendOrigin()

		// Triggers the sendResetPassword callback configured in Better Auth,
		// which actually delivers the email via Resend.
		await auth.api.requestPasswordReset({
			body: {
				email,
				redirectTo: `${frontendUrl}/reset-password`,
			},
		})
	}
}
