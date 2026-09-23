import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)

/**
 * Derives the calendar date (YYYY-MM-DD) a given instant falls on, in a
 * store's own timezone (`Store.timezone`) rather than UTC or the server's
 * local time. This is the "Organization Date" pattern: any "same day" /
 * "stale as of yesterday" rule in this domain (see ADR 0005's Stale PDV
 * Session) is decided against this, not a raw UTC comparison.
 */
export function getStoreLocalDate(at: Date, storeTimezone: string): string {
	return dayjs(at).tz(storeTimezone).format('YYYY-MM-DD')
}

/** Whether two instants fall on the same calendar day in the store's timezone. */
export function isSameStoreLocalDay(a: Date, b: Date, storeTimezone: string): boolean {
	return getStoreLocalDate(a, storeTimezone) === getStoreLocalDate(b, storeTimezone)
}
