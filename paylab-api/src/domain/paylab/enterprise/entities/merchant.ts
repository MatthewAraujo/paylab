import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'

export interface MerchantProps {
	name: string
}

export class Merchant extends Entity<MerchantProps> {
	get name() {
		return this.props.name
	}

	static create(props: MerchantProps, id?: UniqueEntityID) {
		return new Merchant(props, id)
	}
}
