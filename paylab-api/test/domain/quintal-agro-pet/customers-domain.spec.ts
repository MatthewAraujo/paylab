import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { StoreCustomer } from '@/domain/quintalpet/enterprise/entities/store-customer'
import { StoreCustomerAddress } from '@/domain/quintalpet/enterprise/entities/store-customer-address'
import { InvalidStoreCustomerTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-store-customer-transition-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'
import { StoreCustomerStatus } from '@/domain/quintalpet/enterprise/types/store-customer-status'

function createAddress(props: Partial<Parameters<typeof StoreCustomerAddress.create>[0]> = {}) {
	return StoreCustomerAddress.create({
		storeCustomerId: new UniqueEntityID('store-customer-1'),
		street: 'Rua das Flores',
		number: '123',
		neighborhood: 'Centro',
		city: 'Sao Paulo',
		state: 'SP',
		postalCode: '01000-000',
		...props,
	})
}

describe('quintal agro pet customers domain', () => {
	test('StoreCustomer.create defaults status to ACTIVE', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		expect(storeCustomer.status).toBe(StoreCustomerStatus.ACTIVE)
	})

	test('suspend moves ACTIVE to SUSPENDED and rejects a second suspend', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		storeCustomer.suspend()
		expect(storeCustomer.status).toBe(StoreCustomerStatus.SUSPENDED)

		expect(() => storeCustomer.suspend()).toThrow(InvalidStoreCustomerTransitionError)
	})

	test('reactivate moves SUSPENDED back to ACTIVE and rejects reactivating an already-ACTIVE customer', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		expect(() => storeCustomer.reactivate()).toThrow(InvalidStoreCustomerTransitionError)

		storeCustomer.suspend()
		storeCustomer.reactivate()
		expect(storeCustomer.status).toBe(StoreCustomerStatus.ACTIVE)
	})

	test('addAddress demotes the previous default when a new default address is added', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		const first = createAddress({ isDefault: true })
		const second = createAddress({ isDefault: true, street: 'Rua Nova' })

		storeCustomer.addAddress(first)
		expect(first.isDefault).toBe(true)

		storeCustomer.addAddress(second)
		expect(first.isDefault).toBe(false)
		expect(second.isDefault).toBe(true)
	})

	test('removeAddress clears state cleanly when removing the only address', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		const only = createAddress({ isDefault: true })
		storeCustomer.addAddress(only)

		expect(() => storeCustomer.removeAddress(only.id)).not.toThrow()
		expect(storeCustomer.addresses).toHaveLength(0)
	})

	test('removeAddress on the current default does not auto-promote another address', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		const defaultAddress = createAddress({ isDefault: true })
		const other = createAddress({ isDefault: false, street: 'Rua Nova' })
		storeCustomer.addAddress(defaultAddress)
		storeCustomer.addAddress(other)

		storeCustomer.removeAddress(defaultAddress.id)

		expect(storeCustomer.addresses).toHaveLength(1)
		expect(storeCustomer.addresses[0].isDefault).toBe(false)
	})

	test('setDefaultAddress throws StoreCustomerAddressNotFoundError for an unknown address id', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		expect(() => storeCustomer.setDefaultAddress(new UniqueEntityID('unknown'))).toThrow(
			StoreCustomerAddressNotFoundError,
		)
	})

	test('setDefaultAddress switches the default to the given address id', () => {
		const storeCustomer = StoreCustomer.create({
			storeId: new UniqueEntityID('store-1'),
			customerProfileId: 'customer-profile-1',
			email: 'ana@example.com',
		})

		const first = createAddress({ isDefault: true })
		const second = createAddress({ isDefault: false, street: 'Rua Nova' })
		storeCustomer.addAddress(first)
		storeCustomer.addAddress(second)

		storeCustomer.setDefaultAddress(second.id)

		expect(first.isDefault).toBe(false)
		expect(second.isDefault).toBe(true)
	})
})
