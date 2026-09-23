import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PermissionService } from './permission.service'

/**
 * Guard that ensures the authenticated user is a platform admin
 * (i.e., has a PlatformAdmin record) — independent of any single store.
 */
@Injectable()
export class PlatformAdminOnlyGuard implements CanActivate {
	constructor(private permissionService: PermissionService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const userId = request.user?.id

		if (!userId) {
			throw new ForbiddenException('User not authenticated')
		}

		const isPlatformAdmin = await this.permissionService.isPlatformAdmin(userId)
		if (!isPlatformAdmin) {
			throw new ForbiddenException('Only platform admins can access this resource')
		}

		return true
	}
}
