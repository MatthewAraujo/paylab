import { ApiKeysRepository } from '@/domain/paylab/application/repositories/api-keys-repository'
import { MerchantsRepository } from '@/domain/paylab/application/repositories/merchants-repository'
import { AuthenticateMerchantUseCase } from '@/domain/paylab/application/use-cases/authenticate-merchant'
import { ProvisionMerchantUseCase } from '@/domain/paylab/application/use-cases/provision-merchant'
import { PrismaApiKeysRepository } from '@/infra/database/repositories/prisma-api-keys-repository'
import { PrismaMerchantsRepository } from '@/infra/database/repositories/prisma-merchants-repository'
import { Module } from '@nestjs/common'
import { ApiKeyGuard } from './api-key.guard'

// Modules with protected controllers import AuthModule and use `@UseGuards(ApiKeyGuard)`.
@Module({
	providers: [
		{ provide: ApiKeysRepository, useClass: PrismaApiKeysRepository },
		{ provide: MerchantsRepository, useClass: PrismaMerchantsRepository },
		AuthenticateMerchantUseCase,
		ProvisionMerchantUseCase,
		ApiKeyGuard,
	],
	exports: [AuthenticateMerchantUseCase, ProvisionMerchantUseCase, ApiKeyGuard],
})
export class AuthModule {}
