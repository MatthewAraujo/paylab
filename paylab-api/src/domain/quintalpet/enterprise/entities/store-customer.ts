import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidStoreCustomerTransitionError } from '../errors/invalid-store-customer-transition-error'
import { StoreCustomerAddressNotFoundError } from '../errors/store-customer-address-not-found-error'
import { StoreCustomerStatus } from '../types/store-customer-status'
import { StoreCustomerAddress } from './store-customer-address'

export interface StoreCustomerProps {
	storeId: UniqueEntityID
	customerProfileId: string
	name?: string | null
	email: string
	phone?: string | null
	status: StoreCustomerStatus
	addresses: StoreCustomerAddress[]
	totalOrders: number
	totalSpentCents: number
	lastOrderAt?: Date | null
	createdAt: Date
	updatedAt?: Date | null
}

export class StoreCustomer extends AggregateRoot<StoreCustomerProps> {
	get storeId() {
		return this.props.storeId
	}

	get customerProfileId() {
		return this.props.customerProfileId
	}

	get name() {
		return this.props.name ?? null
	}

	get email() {
		return this.props.email
	}

	get phone() {
		return this.props.phone ?? null
	}

	get status() {
		return this.props.status
	}

	get addresses() {
		return this.props.addresses
	}

	get totalOrders() {
		return this.props.totalOrders
	}

	get totalSpentCents() {
		return this.props.totalSpentCents
	}

	get lastOrderAt() {
		return this.props.lastOrderAt ?? null
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	updateContact(props: { name?: string | null; phone?: string | null }) {
		if (props.name !== undefined) this.props.name = props.name
		if (props.phone !== undefined) this.props.phone = props.phone
		this.touch()
	}

	addAddress(address: StoreCustomerAddress) {
		if (address.isDefault) {
			for (const existing of this.props.addresses) existing.unmarkAsDefault()
		}
		this.props.addresses.push(address)
		this.touch()
	}

	removeAddress(addressId: UniqueEntityID) {
		const exists = this.props.addresses.some((address) => address.id.equals(addressId))
		if (!exists) throw new StoreCustomerAddressNotFoundError()

		this.props.addresses = this.props.addresses.filter((address) => !address.id.equals(addressId))
		this.touch()
	}

	setDefaultAddress(addressId: UniqueEntityID) {
		const target = this.props.addresses.find((address) => address.id.equals(addressId))
		if (!target) throw new StoreCustomerAddressNotFoundError()

		for (const address of this.props.addresses) address.unmarkAsDefault()
		target.markAsDefault()
		this.touch()
	}

	registerOrder(totalCents: number, occurredAt: Date = new Date()) {
		this.props.totalOrders += 1
		this.props.totalSpentCents += totalCents
		this.props.lastOrderAt = occurredAt
		this.touch()
	}

	reverseOrder(totalCents: number) {
		this.props.totalOrders = Math.max(0, this.props.totalOrders - 1)
		this.props.totalSpentCents = Math.max(0, this.props.totalSpentCents - totalCents)
		this.touch()
		// lastOrderAt is intentionally left as-is — recomputing the "true" previous value
		// would require scanning the customer's other orders, and it's a display-only
		// field. Same call already made in the PRD's Implementation Decisions.
	}

	suspend() {
		if (this.props.status === StoreCustomerStatus.SUSPENDED) {
			throw new InvalidStoreCustomerTransitionError()
		}
		this.props.status = StoreCustomerStatus.SUSPENDED
		this.touch()
	}

	reactivate() {
		if (this.props.status !== StoreCustomerStatus.SUSPENDED) {
			throw new InvalidStoreCustomerTransitionError()
		}
		this.props.status = StoreCustomerStatus.ACTIVE
		this.touch()
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	static create(
		props: Optional<
			StoreCustomerProps,
			'status' | 'addresses' | 'totalOrders' | 'totalSpentCents' | 'lastOrderAt' | 'createdAt'
		>,
		id?: UniqueEntityID,
	) {
		return new StoreCustomer(
			{
				...props,
				status: props.status ?? StoreCustomerStatus.ACTIVE,
				addresses: props.addresses ?? [],
				totalOrders: props.totalOrders ?? 0,
				totalSpentCents: props.totalSpentCents ?? 0,
				lastOrderAt: props.lastOrderAt ?? null,
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}
}
