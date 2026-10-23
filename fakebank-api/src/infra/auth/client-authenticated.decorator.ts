import { ErrorEnvelopeResponse } from '@/infra/http/openapi/error-envelope.response'
import { UseGuards, applyDecorators } from '@nestjs/common'
import { ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger'
import { ClientAuthGuard } from './client-auth.guard'

/**
 * AC-9: the route needs a Client's API key (`Authorization: Bearer <key>`, checked by
 * ClientAuthGuard); documents the bearer auth and the 401 every such route can answer.
 */
export function ClientAuthenticated(): ClassDecorator & MethodDecorator {
	return applyDecorators(
		ApiBearerAuth(),
		ApiUnauthorizedResponse({
			description: 'Missing or unknown API key (UNAUTHORIZED).',
			type: ErrorEnvelopeResponse,
		}),
		UseGuards(ClientAuthGuard),
	)
}
