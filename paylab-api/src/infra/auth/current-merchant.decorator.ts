import { ExecutionContext, createParamDecorator } from '@nestjs/common'

/** The authenticated Merchant every scoped query and command must use. */
export interface MerchantContext {
	id: string
}

export const MERCHANT_REQUEST_KEY = 'merchant'

/** Injects the Merchant resolved by `ApiKeyGuard`; use only on guarded routes. */
export const CurrentMerchant = createParamDecorator(
	(_data: unknown, context: ExecutionContext): MerchantContext => {
		return context.switchToHttp().getRequest()[MERCHANT_REQUEST_KEY]
	},
)
