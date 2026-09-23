import { Entity } from '@/core/entities/entity'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { CRMInteractionChannel } from '../types/crm-interaction-channel'
import { CRMInteractionType } from '../types/crm-interaction-type'

export interface CRMInteractionProps {
	crmProfileId: UniqueEntityID
	type: CRMInteractionType
	channel: CRMInteractionChannel
	subject?: string | null
	content?: string | null
	createdBy?: string | null
	createdAt: Date
}

export class CRMInteraction extends Entity<CRMInteractionProps> {
	get crmProfileId() {
		return this.props.crmProfileId
	}

	get type() {
		return this.props.type
	}

	get channel() {
		return this.props.channel
	}

	get subject() {
		return this.props.subject ?? null
	}

	get content() {
		return this.props.content ?? null
	}

	get createdBy() {
		return this.props.createdBy ?? null
	}

	get createdAt() {
		return this.props.createdAt
	}

	static create(props: Optional<CRMInteractionProps, 'createdAt'>, id?: UniqueEntityID) {
		return new CRMInteraction({ ...props, createdAt: props.createdAt ?? new Date() }, id)
	}
}
