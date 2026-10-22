import { EnvService } from '@/infra/env/env.service'
import {
	CanActivate,
	ExecutionContext,
	HttpException,
	HttpStatus,
	Injectable,
} from '@nestjs/common'
import { hashApiKey, hashesMatch } from './api-key'
import { RequestWithClient } from './authenticated-client'

const BEARER = /^Bearer ([\x21-\x7E]+)$/

/**
 * AC-9 / AC-34: resolves the Client from `Authorization: Bearer <key>` by comparing the key's
 * SHA-256 with every configured hash in constant time. Any failure is the same 401, and the
 * key is never logged or echoed.
 */
@Injectable()
export class ClientAuthGuard implements CanActivate {
	constructor(private readonly envService: EnvService) {}

	canActivate(context: ExecutionContext): boolean {
		const request = context.switchToHttp().getRequest<RequestWithClient>()
		const header = request.headers.authorization
		const match = typeof header === 'string' ? BEARER.exec(header) : null
		const keyHash = match ? hashApiKey(match[1]) : null
		// Compare against every Client, without stopping early, so timing does not reveal which matched.
		let clientId: string | null = null
		for (const credential of this.envService.get('FAKEBANK_CLIENTS')) {
			if (keyHash && hashesMatch(keyHash, credential.keyHash)) {
				clientId = credential.clientId
			}
		}

		if (!clientId) {
			throw new HttpException(
				{ code: 'UNAUTHORIZED', message: 'A valid API key is required.' },
				HttpStatus.UNAUTHORIZED,
			)
		}
		request.client = { clientId }
		return true
	}
}
