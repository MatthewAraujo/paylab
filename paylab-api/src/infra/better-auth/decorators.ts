import { UseGuards, applyDecorators } from '@nestjs/common'
import { CustomerOnlyGuard } from './customer-only.guard'
import { PlatformAdminOnlyGuard } from './platform-admin-only.guard'
import { StoreMemberOnlyGuard } from './store-member-only.guard'

/**
 * Decorator to restrict route access to customers only
 * Usage: @CustomerOnly() on controller method
 */
export function CustomerOnly() {
	return applyDecorators(UseGuards(CustomerOnlyGuard))
}

/**
 * Decorator to restrict route access to store members only
 * Usage: @StoreMemberOnly() on controller method
 */
export function StoreMemberOnly() {
	return applyDecorators(UseGuards(StoreMemberOnlyGuard))
}

/**
 * Decorator to restrict route access to platform admins only
 * Usage: @PlatformAdminOnly() on controller method
 */
export function PlatformAdminOnly() {
	return applyDecorators(UseGuards(PlatformAdminOnlyGuard))
}
