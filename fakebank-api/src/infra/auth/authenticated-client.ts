import { ExecutionContext, createParamDecorator } from '@nestjs/common'

/** The Client resolved from the request's API key by ClientAuthGuard. */
export interface AuthenticatedClient {
	clientId: string
}

export interface RequestWithClient {
	headers: Record<string, string | string[] | undefined>
	client?: AuthenticatedClient
}

/** The Client of a route protected by ClientAuthGuard. */
export const CurrentClient = createParamDecorator(
	(_data: unknown, context: ExecutionContext): AuthenticatedClient => {
		const client = context.switchToHttp().getRequest<RequestWithClient>().client
		if (!client) {
			throw new Error('CurrentClient used on a route without ClientAuthGuard')
		}
		return client
	},
)
