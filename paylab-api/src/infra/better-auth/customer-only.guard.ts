import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PermissionService } from './permission.service'

/**
 * Guard that ensures the authenticated user is a customer
 * (i.e., has a CustomerProfile, not a StoreMember)
 */
@Injectable()
export class CustomerOnlyGuard implements CanActivate {
	constructor(private permissionService: PermissionService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const userId = request.user?.id

		if (!userId) {
			throw new ForbiddenException('User not authenticated')
		}

		const isCustomer = await this.permissionService.isCustomer(userId)
		if (!isCustomer) {
			throw new ForbiddenException('Only customers can access this resource')
		}

		return true
	}
}
