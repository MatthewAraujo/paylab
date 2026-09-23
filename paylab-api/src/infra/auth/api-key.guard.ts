import { AuthenticateMerchantUseCase } from '@/domain/paylab/application/use-cases/authenticate-merchant'
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'
import { MERCHANT_REQUEST_KEY, MerchantContext } from './current-merchant.decorator'

const BEARER = /^Bearer (\S+)$/

/**
 * Authenticates a request by `Authorization: Bearer <api key>` and attaches the
 * Merchant to the request. Every rejection is the same generic 401 so a caller
 * cannot tell a wrong key from a missing one. The key is never logged.
 */
@Injectable()
export class ApiKeyGuard implements CanActivate {
	constructor(private authenticateMerchant: AuthenticateMerchantUseCase) {}

	async canActivate(context: ExecutionContext): Promise<boolean> {
		const request = context.switchToHttp().getRequest()
		const header: unknown = request.headers?.authorization
		const apiKey = typeof header === 'string' ? BEARER.exec(header)?.[1] : undefined

		if (!apiKey) {
			throw new UnauthorizedException('Invalid API key')
		}

		const result = await this.authenticateMerchant.execute({ apiKey })

		if (result.isLeft()) {
			throw new UnauthorizedException('Invalid API key')
		}

		request[MERCHANT_REQUEST_KEY] = { id: result.value.merchantId } satisfies MerchantContext

		return true
	}
}
