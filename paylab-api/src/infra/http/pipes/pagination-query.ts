import { BadRequestException } from '@nestjs/common'
import { z } from 'zod'

/**
 * Shared parsing for `?page` / `?perPage` list query strings. The controllers
 * used to do `page ? Number(page) : 1`, which turns `?page=abc` into `NaN` and
 * pushes it straight into Prisma's `skip`/`take`. This coerces, bounds, and
 * rejects garbage with a 400 instead.
 */
export const paginationQuerySchema = z.object({
	page: z.coerce.number().int().positive().max(100_000).optional(),
	perPage: z.coerce.number().int().positive().max(100).optional(),
})

export type PaginationQuery = z.infer<typeof paginationQuerySchema>

export function parsePaginationQuery(raw: {
	page?: string
	perPage?: string
}): PaginationQuery {
	const result = paginationQuerySchema.safeParse(raw)
	if (!result.success) {
		throw new BadRequestException('Invalid pagination parameters.')
	}
	return result.data
}
