import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

export interface StoreCustomerAddressProps {
	storeCustomerId: UniqueEntityID
	street: string
	number: string
	complement?: string | null
	neighborhood: string
	city: string
	state: string
	postalCode: string
	isDefault: boolean
	createdAt: Date
}

export class StoreCustomerAddress extends Entity<StoreCustomerAddressProps> {
	get storeCustomerId() {
		return this.props.storeCustomerId
	}

	get street() {
		return this.props.street
	}

	get number() {
		return this.props.number
	}

	get complement() {
		return this.props.complement ?? null
	}

	get neighborhood() {
		return this.props.neighborhood
	}

	get city() {
		return this.props.city
	}

	get state() {
		return this.props.state
	}

	get postalCode() {
		return this.props.postalCode
	}

	get isDefault() {
		return this.props.isDefault
	}

	get createdAt() {
		return this.props.createdAt
	}

	markAsDefault() {
		this.props.isDefault = true
	}

	unmarkAsDefault() {
		this.props.isDefault = false
	}

	updateDetails(
		props: Partial<Omit<StoreCustomerAddressProps, 'storeCustomerId' | 'createdAt' | 'isDefault'>>,
	) {
		if (props.street !== undefined) this.props.street = props.street
		if (props.number !== undefined) this.props.number = props.number
		if (props.complement !== undefined) this.props.complement = props.complement
		if (props.neighborhood !== undefined) this.props.neighborhood = props.neighborhood
		if (props.city !== undefined) this.props.city = props.city
		if (props.state !== undefined) this.props.state = props.state
		if (props.postalCode !== undefined) this.props.postalCode = props.postalCode
	}

	static create(
		props: Optional<StoreCustomerAddressProps, 'isDefault' | 'createdAt'>,
		id?: UniqueEntityID,
	) {
		return new StoreCustomerAddress(
			{
				...props,
				isDefault: props.isDefault ?? false,
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}
}
