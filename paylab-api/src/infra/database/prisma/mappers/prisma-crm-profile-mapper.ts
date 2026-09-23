import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CRMInteraction } from '@/domain/quintalpet/enterprise/entities/crm-interaction'
import { CRMProfile } from '@/domain/quintalpet/enterprise/entities/crm-profile'
import { CRMInteractionChannel } from '@/domain/quintalpet/enterprise/types/crm-interaction-channel'
import { CRMInteractionType } from '@/domain/quintalpet/enterprise/types/crm-interaction-type'
import { CustomerSegment } from '@/domain/quintalpet/enterprise/types/customer-segment'
import { Prisma } from '@prisma/client'

export type PrismaCRMProfileAggregate = Prisma.CRMProfileGetPayload<{
	include: { interactions: true }
}>

export class PrismaCrmProfileMapper {
	static toDomain(raw: PrismaCRMProfileAggregate): CRMProfile {
		return CRMProfile.create(
			{
				storeCustomerId: new UniqueEntityID(raw.storeCustomerId),
				segment: raw.segment as CustomerSegment,
				tags: raw.tags,
				notes: raw.notes,
				lastContactAt: raw.lastContactAt,
				interactions: raw.interactions
					.slice()
					.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
					.map((interaction) =>
						CRMInteraction.create(
							{
								crmProfileId: new UniqueEntityID(raw.id),
								type: interaction.type as CRMInteractionType,
								channel: interaction.channel as CRMInteractionChannel,
								subject: interaction.subject,
								content: interaction.content,
								createdBy: interaction.createdBy,
								createdAt: interaction.createdAt,
							},
							new UniqueEntityID(interaction.id),
						),
					),
				createdAt: raw.createdAt,
				updatedAt: raw.updatedAt,
			},
			new UniqueEntityID(raw.id),
		)
	}

	static toPrisma(crmProfile: CRMProfile): Prisma.CRMProfileUncheckedCreateInput {
		return {
			id: crmProfile.id.toString(),
			storeCustomerId: crmProfile.storeCustomerId.toString(),
			segment: crmProfile.segment,
			tags: crmProfile.tags,
			notes: crmProfile.notes,
			lastContactAt: crmProfile.lastContactAt,
			createdAt: crmProfile.createdAt,
			updatedAt: crmProfile.updatedAt ?? undefined,
		}
	}

	static interactionToPrisma(
		interaction: CRMInteraction,
		crmProfileId: string,
	): Prisma.CRMInteractionUncheckedCreateInput {
		return {
			id: interaction.id.toString(),
			crmProfileId,
			type: interaction.type,
			channel: interaction.channel,
			subject: interaction.subject,
			content: interaction.content,
			createdBy: interaction.createdBy,
			createdAt: interaction.createdAt,
		}
	}
}
