import { MerchantsRepository } from '@/domain/paylab/application/repositories/merchants-repository'
import { Merchant } from '@/domain/paylab/enterprise/entities/merchant'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class PrismaMerchantsRepository extends MerchantsRepository {
	constructor(private prisma: PrismaService) {
		super()
	}

	async createWithApiKey(merchant: Merchant, keyHash: string): Promise<void> {
		// Nested create runs in one transaction: no Merchant without its key.
		await this.prisma.merchant.create({
			data: {
				id: merchant.id.toString(),
				name: merchant.name,
				apiKeys: { create: { keyHash } },
			},
		})
	}
}
