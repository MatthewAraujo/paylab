import {
	StoreSummary,
	StoresRepository,
} from '@/domain/quintalpet/application/repositories/stores-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

@Injectable()
export class PrismaStoresRepository implements StoresRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findById(id: string): Promise<StoreSummary | null> {
		const store = await this.prisma.store.findUnique({
			where: { id },
		})

		if (!store) {
			return null
		}

		return {
			id: store.id,
			name: store.name,
			slug: store.slug,
			timezone: store.timezone,
		}
	}

	async findBySlug(slug: string): Promise<StoreSummary | null> {
		const store = await this.prisma.store.findUnique({
			where: { slug },
		})

		if (!store) {
			return null
		}

		return {
			id: store.id,
			name: store.name,
			slug: store.slug,
			timezone: store.timezone,
		}
	}
}
