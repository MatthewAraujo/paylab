import {
	ApiKeyRecord,
	ApiKeysRepository,
} from '@/domain/paylab/application/repositories/api-keys-repository'
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma.service'

@Injectable()
export class PrismaApiKeysRepository extends ApiKeysRepository {
	constructor(private prisma: PrismaService) {
		super()
	}

	async findByKeyHash(keyHash: string): Promise<ApiKeyRecord | null> {
		const row = await this.prisma.merchantApiKey.findUnique({ where: { keyHash } })

		if (!row) {
			return null
		}

		return { merchantId: row.merchantId, keyHash: row.keyHash, revokedAt: row.revokedAt }
	}
}
