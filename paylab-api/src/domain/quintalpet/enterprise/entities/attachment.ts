import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'

interface AttachmentProps {
	storeId: UniqueEntityID
	title: string
	url: string
	createdAt: Date
}

export class Attachment extends AggregateRoot<AttachmentProps> {
	get storeId() {
		return this.props.storeId
	}

	get title() {
		return this.props.title
	}

	get url() {
		return this.props.url
	}

	get createdAt() {
		return this.props.createdAt
	}

	static create(props: Optional<AttachmentProps, 'createdAt'>, id?: UniqueEntityID) {
		return new Attachment(
			{
				...props,
				createdAt: props.createdAt ?? new Date(),
			},
			id,
		)
	}
}
