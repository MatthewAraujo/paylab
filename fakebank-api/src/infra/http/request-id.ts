import { randomUUID } from 'node:crypto'

export const REQUEST_ID_HEADER = 'X-Request-Id'

// Printable ASCII without spaces, bounded: anything else is not echoed (it could break the
// response header or flood logs) and a fresh id is generated instead.
const ACCEPTED_REQUEST_ID = /^[\x21-\x7E]{1,128}$/

interface RequestLike {
	header(name: string): string | undefined
}

interface ResponseLike {
	setHeader(name: string, value: string): unknown
	getHeader(name: string): unknown
}

/**
 * Express middleware, mounted before routing so every response (unknown routes included)
 * carries the request id: the caller's `X-Request-Id` when acceptable, otherwise a new UUID.
 * The response header is the single place the id lives for the rest of the request.
 */
export function requestIdMiddleware(req: RequestLike, res: ResponseLike, next: () => void) {
	const incoming = req.header(REQUEST_ID_HEADER)
	const requestId = incoming && ACCEPTED_REQUEST_ID.test(incoming) ? incoming : randomUUID()

	res.setHeader(REQUEST_ID_HEADER, requestId)
	next()
}

export function requestIdOf(res: ResponseLike): string {
	return String(res.getHeader(REQUEST_ID_HEADER) ?? '')
}
