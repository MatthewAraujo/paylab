import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { InventoryItem } from '@/domain/quintalpet/enterprise/entities/inventory-item'
import { InvalidInventoryQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-inventory-quantity-error'
import { MerchandisingLimitExceededError } from '@/domain/quintalpet/enterprise/errors/merchandising-limit-exceeded-error'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { InventoryMovementType } from '@/domain/quintalpet/enterprise/types/inventory-movement-type'
import { translateDomainError } from '@/infra/http/error-translation/domain-error-messages'

describe('quintal agro pet inventory domain', () => {
	test('inbound stock increases the available balance', () => {
		const item = InventoryItem.create({
			storeId: new UniqueEntityID('store-1'),
			variantId: new UniqueEntityID('variant-1'),
		})

		const movement = item.receive(8, 'supplier receipt')

		expect(item.availableQuantity).toBe(8)
		expect(movement.type).toBe(InventoryMovementType.INBOUND)
		expect(movement.quantityDelta).toBe(8)
		expect(movement.balanceAfter).toBe(8)
	})

	test('outbound stock decreases the available balance', () => {
		const item = InventoryItem.create({
			storeId: new UniqueEntityID('store-1'),
			variantId: new UniqueEntityID('variant-1'),
			availableQuantity: 10,
		})

		const movement = item.remove(3, 'manual removal')

		expect(item.availableQuantity).toBe(7)
		expect(movement.type).toBe(InventoryMovementType.OUTBOUND)
		expect(movement.quantityDelta).toBe(-3)
		expect(movement.balanceAfter).toBe(7)
	})

	test('adjustment applies an explicit signed delta', () => {
		const item = InventoryItem.create({
			storeId: new UniqueEntityID('store-1'),
			variantId: new UniqueEntityID('variant-1'),
			availableQuantity: 10,
		})

		const movement = item.adjust(-2, 'shrinkage')

		expect(item.availableQuantity).toBe(8)
		expect(movement.type).toBe(InventoryMovementType.ADJUSTMENT)
		expect(movement.quantityDelta).toBe(-2)
		expect(movement.balanceAfter).toBe(8)
	})

	test('return stock increases the available balance', () => {
		const item = InventoryItem.create({
			storeId: new UniqueEntityID('store-1'),
			variantId: new UniqueEntityID('variant-1'),
			availableQuantity: 4,
		})

		const movement = item.returnStock(2, 'customer return')

		expect(item.availableQuantity).toBe(6)
		expect(movement.type).toBe(InventoryMovementType.RETURN)
		expect(movement.quantityDelta).toBe(2)
		expect(movement.balanceAfter).toBe(6)
	})

	test('invalid operations are rejected before persistence', () => {
		const item = InventoryItem.create({
			storeId: new UniqueEntityID('store-1'),
			variantId: new UniqueEntityID('variant-1'),
			availableQuantity: 1,
		})

		expect(() => item.receive(0)).toThrow(InvalidInventoryQuantityError)
		expect(() => item.adjust(0)).toThrow(InvalidInventoryQuantityError)
		expect(() => item.remove(2)).toThrow(NegativeInventoryBalanceError)
	})

	test('domain error translation maps known errors to a friendly PT-BR {code, message}, unmapped errors pass through', () => {
		expect(translateDomainError(new NegativeInventoryBalanceError())).toEqual({
			code: 'INVENTORY_BALANCE_NEGATIVE',
			message: 'Não há estoque suficiente para atender esta movimentação.',
		})

		expect(translateDomainError(new MerchandisingLimitExceededError('category', 3))).toEqual({
			code: 'MERCHANDISING_LIMIT_EXCEEDED',
			message: 'Você já atingiu o limite de 3 categorias em destaque.',
		})

		expect(translateDomainError(new MerchandisingLimitExceededError('product', 8))).toEqual({
			code: 'MERCHANDISING_LIMIT_EXCEEDED',
			message: 'Você já atingiu o limite de 8 produtos em destaque.',
		})

		expect(translateDomainError(new InvalidInventoryQuantityError())).toEqual({
			code: 'INVALID_INVENTORY_QUANTITY',
			message: 'Movimentações de estoque exigem uma quantidade positiva e diferente de zero.',
		})

		expect(translateDomainError(new Error('some unmapped error'))).toBeNull()
	})
})
