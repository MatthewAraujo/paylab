import { KeysetPosition } from '../repositories/read-queries-repository'

export const DEFAULT_PAGE_SIZE = 20
export const MAX_PAGE_SIZE = 100

export interface KeysetPage<T> {
	items: T[]
	/** Position of the last returned row when another page exists, otherwise null. */
	next: KeysetPosition | null
}

/** Rows to ask the repository for: one more than the page size, to detect a next page. */
export function fetchSize(pageSize: number) {
	return pageSize + 1
}

/** Trims the extra row fetched by `fetchSize` and derives the next position from the last kept row. */
export function toKeysetPage<T extends { id: string; createdAt: Date }>(
	rows: T[],
	pageSize: number,
): KeysetPage<T> {
	if (rows.length <= pageSize) {
		return { items: rows, next: null }
	}

	const items = rows.slice(0, pageSize)
	const last = items[items.length - 1]

	return { items, next: { createdAt: last.createdAt, id: last.id } }
}
