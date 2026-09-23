import { randomBytes } from 'node:crypto'

export function generateOrderCode(storeSlug: string): string {
	const prefix = storeSlug.split('-')[0].toUpperCase().slice(0, 4)
	const suffix = randomBytes(4).toString('hex').toUpperCase()
	return `${prefix}-${suffix}`
}
