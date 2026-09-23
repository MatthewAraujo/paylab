import { hasSellableStock } from '@/domain/quintalpet/application/use-cases/query-storefront'

describe('hasSellableStock', () => {
	test('is true when at least one variant has a positive available quantity', () => {
		expect(
			hasSellableStock([
				{ inventoryItem: { availableQuantity: 0 } },
				{ inventoryItem: { availableQuantity: 3 } },
			]),
		).toBe(true)
	})

	test('is false when every variant is at zero available quantity', () => {
		expect(
			hasSellableStock([
				{ inventoryItem: { availableQuantity: 0 } },
				{ inventoryItem: { availableQuantity: 0 } },
			]),
		).toBe(false)
	})

	test('treats a variant with no InventoryItem row as zero', () => {
		expect(hasSellableStock([{ inventoryItem: null }])).toBe(false)
	})

	test('is false for an empty variant list', () => {
		expect(hasSellableStock([])).toBe(false)
	})
})
