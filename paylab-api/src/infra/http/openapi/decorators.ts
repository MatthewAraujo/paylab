import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/domain/paylab/application/services/keyset-page'
import { Type, applyDecorators } from '@nestjs/common'
import {
	ApiBearerAuth,
	ApiOkResponse,
	ApiParam,
	ApiQuery,
	ApiResponse,
	ApiUnauthorizedResponse,
} from '@nestjs/swagger'
import { ErrorResponse, UnauthorizedResponse, ValidationErrorResponse } from './responses'

/** A read route: typed 200, the shared 401, and optionally 404 (owned resource) and 422. */
export function ApiReadRoute(
	response: Type<unknown>,
	options: { notFound?: boolean; validated?: boolean } = {},
) {
	return applyDecorators(
		ApiBearerAuth(),
		ApiOkResponse({ type: response }),
		ApiUnauthorizedResponse({ type: UnauthorizedResponse }),
		...(options.notFound
			? [
					ApiResponse({
						status: 404,
						type: ErrorResponse,
						description: "Unknown id or another Merchant's resource (indistinguishable).",
					}),
				]
			: []),
		...(options.validated
			? [ApiResponse({ status: 422, type: ValidationErrorResponse, description: 'Invalid input.' })]
			: []),
	)
}

export function ApiIdParam() {
	return ApiParam({ name: 'id', format: 'uuid' })
}

/** Cursor-only keyset pagination parameters shared by every list. */
export function ApiPageQuery() {
	return applyDecorators(
		ApiQuery({
			name: 'limit',
			required: false,
			schema: { type: 'integer', minimum: 1, maximum: MAX_PAGE_SIZE, default: DEFAULT_PAGE_SIZE },
		}),
		ApiQuery({
			name: 'cursor',
			required: false,
			description: 'Opaque `nextCursor` from the previous page.',
			schema: { type: 'string' },
		}),
	)
}
