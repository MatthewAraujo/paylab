import { ExecutionContext, ForbiddenException, createParamDecorator } from '@nestjs/common'

/**
 * Extracts the current request's storeId from `request.accessibleStores`,
 * which is populated by `StoreMemberOnlyGuard` (see `@StoreMemberOnly()`).
 * Must only be used on routes protected by `@StoreMemberOnly()`.
 */
export const CurrentStoreId = createParamDecorator(
	(_: never, context: ExecutionContext): string => {
		const request = context.switchToHttp().getRequest()
		const accessibleStores = request.accessibleStores as string[] | undefined
		const storeId = accessibleStores?.[0]

		if (!storeId) {
			throw new ForbiddenException('No accessible store for the current user.')
		}

		return storeId
	},
)
