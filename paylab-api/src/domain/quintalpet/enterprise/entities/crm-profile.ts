import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { CustomerSegment } from '../types/customer-segment'
import { CRMInteraction } from './crm-interaction'

export interface CRMProfileProps {
	storeCustomerId: UniqueEntityID
	segment: CustomerSegment
	tags: string[]
	notes?: string | null
	lastContactAt?: Date | null
	interactions: CRMInteraction[]
	createdAt: Date
	updatedAt?: Date | null
}

export class CRMProfile extends AggregateRoot<CRMProfileProps> {
	get storeCustomerId() {
		return this.props.storeCustomerId
	}

	get segment() {
		return this.props.segment
	}

	get tags() {
		return this.props.tags
	}

	get notes() {
		return this.props.notes ?? null
	}

	get lastContactAt() {
		return this.props.lastContactAt ?? null
	}

	get interactions() {
		return this.props.interactions
	}

	get createdAt() {
		return this.props.createdAt
	}

	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	updateSegment(segment: CustomerSegment) {
		this.props.segment = segment
		this.touch()
	}

	addTag(tag: string) {
		if (!this.props.tags.includes(tag)) {
			this.props.tags = [...this.props.tags, tag]
			this.touch()
		}
	}

	removeTag(tag: string) {
		if (this.props.tags.includes(tag)) {
			this.props.tags = this.props.tags.filter((existing) => existing !== tag)
			this.touch()
		}
	}

	recordInteraction(props: Omit<Parameters<typeof CRMInteraction.create>[0], 'crmProfileId'>) {
		const interaction = CRMInteraction.create({ ...props, crmProfileId: this.id })
		this.props.interactions.push(interaction)
		this.props.lastContactAt = interaction.createdAt
		this.touch()
		return interaction
	}

	private touch(at = new Date()) {
		this.props.updatedAt = at
	}

	static create(
		props: Optional<CRMProfileProps, 'segment' | 'tags' | 'interactions' | 'createdAt'>,
		id?: UniqueEntityID,
	) {
		return new CRMProfile(
			{
				...props,
				segment: props.segment ?? CustomerSegment.NEW,
				tags: props.tags ?? [],
				interactions: props.interactions ?? [],
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}
}
