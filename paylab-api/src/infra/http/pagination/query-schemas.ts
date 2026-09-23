import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@/domain/paylab/application/services/keyset-page'
import { z } from 'zod'
import { decodeCursor } from './cursor'

/** `?limit=`: default 20, at most 100; anything else is a validation error, not a clamp. */
export const limitSchema = z.coerce
	.number()
	.int()
	.min(1)
	.max(MAX_PAGE_SIZE)
	.default(DEFAULT_PAGE_SIZE)

/** `?cursor=`: the opaque value from a previous page's `nextCursor`, decoded to a keyset position. */
export const cursorSchema = z.string().transform((value, ctx) => {
	const position = decodeCursor(value)

	if (!position) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid cursor.' })
		return z.NEVER
	}

	return position
})

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

/** A real calendar day, `YYYY-MM-DD` (no rolling over: 2026-02-30 is invalid). */
export const calendarDaySchema = z
	.string()
	.regex(DATE_ONLY, 'Expected a date as YYYY-MM-DD.')
	.refine((value) => {
		const date = new Date(`${value}T00:00:00.000Z`)
		return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
	}, 'Not a real calendar date.')

/**
 * An instant for period filters: an ISO 8601 timestamp with an explicit zone, or a
 * calendar day (taken as 00:00 UTC). A timestamp without a zone is rejected rather
 * than read in the server's timezone.
 */
export const instantSchema = z
	.string()
	.refine(
		(value) =>
			DATE_ONLY.test(value)
				? calendarDaySchema.safeParse(value).success
				: z.string().datetime({ offset: true }).safeParse(value).success &&
					!Number.isNaN(new Date(value).getTime()),
		'Expected an ISO 8601 timestamp with a zone, or a YYYY-MM-DD day.',
	)
	.transform((value) => new Date(value))
