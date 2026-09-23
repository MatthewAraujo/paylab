import { Injectable } from '@nestjs/common'
import { auth } from './better-auth'

@Injectable()
export class BetterAuthService {
	getAuth() {
		return auth
	}

	/**
	 * Get the Better Auth instance for direct API access
	 * Note: This should primarily be used for internal server-side operations
	 */
	getInstance() {
		return auth
	}
}
