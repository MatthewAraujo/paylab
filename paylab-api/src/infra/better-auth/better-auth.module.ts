import { DatabaseModule } from '@/infra/database/database.module'
import { AdminStoreMembersController } from '@/infra/http/controllers/better-auth/admin-store-members.controller'
import { Module } from '@nestjs/common'
import { BetterAuthService } from './better-auth.service'
import { CustomerOnlyGuard } from './customer-only.guard'
import { PermissionService } from './permission.service'
import { PlatformAdminOnlyGuard } from './platform-admin-only.guard'
import { StoreMemberOnlyGuard } from './store-member-only.guard'
import { validateBetterAuthEnv } from './validate-better-auth-env'

@Module({
	imports: [DatabaseModule],
	controllers: [AdminStoreMembersController],
	providers: [
		{
			provide: 'BETTER_AUTH_ENV',
			useValue: validateBetterAuthEnv(),
		},
		BetterAuthService,
		PermissionService,
		CustomerOnlyGuard,
		StoreMemberOnlyGuard,
		PlatformAdminOnlyGuard,
	],
	exports: [
		BetterAuthService,
		PermissionService,
		CustomerOnlyGuard,
		StoreMemberOnlyGuard,
		PlatformAdminOnlyGuard,
	],
})
export class BetterAuthModule {
	constructor() {
		// Validate environment on module initialization
		validateBetterAuthEnv()
	}
}
