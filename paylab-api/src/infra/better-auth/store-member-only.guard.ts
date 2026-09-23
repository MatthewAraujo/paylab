import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common'
import { PermissionService } from './permission.service'

/**
 * Guard that ensures the authenticated user is a store member
 * (i.e., has at least one StoreMember record)
 *
 * Optional: Can validate access to a specific store if storeId is in route params
 */
@Injectable()
export class StoreMemberOnlyGuard implements CanActivate {
	constructor(private permissionService: PermissionService) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const userId = request.user?.id

		if (!userId) {
			throw new ForbiddenException('User not authenticated')
		}

		const isStoreMember = await this.permissionService.isStoreMember(userId)
		if (!isStoreMember) {
			throw new ForbiddenException('Only store members can access this resource')
		}

		// Check store-specific access if storeId is in route params
		const storeId = request.params?.storeId
		if (storeId) {
			const canAccess = await this.permissionService.canAccessStore(userId, storeId)
			if (!canAccess) {
				throw new ForbiddenException('You do not have access to this store')
			}
		}

		// Inject accessible stores into request for later use
		request.accessibleStores = await this.permissionService.getAccessibleStores(userId)

		return true
	}
}
