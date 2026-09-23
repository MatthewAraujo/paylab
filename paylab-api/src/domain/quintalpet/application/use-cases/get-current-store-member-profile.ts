import { StoresRepository } from '@/domain/quintalpet/application/repositories/stores-repository'
import { Injectable } from '@nestjs/common'

interface GetCurrentStoreMemberProfileRequest {
	user: {
		id: string
		name: string
		email: string
	}
	storeId: string
}

@Injectable()
export class GetCurrentStoreMemberProfileUseCase {
	constructor(private readonly storesRepository: StoresRepository) {}

	async execute({ user, storeId }: GetCurrentStoreMemberProfileRequest) {
		const store = await this.storesRepository.findById(storeId)

		if (!store) {
			return null
		}

		return {
			admin: {
				id: user.id,
				name: user.name,
				email: user.email,
			},
			store: {
				id: store.id,
				name: store.name,
				slug: store.slug,
				timezone: store.timezone,
			},
		}
	}
}
