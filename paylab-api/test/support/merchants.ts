import { ProvisionMerchantUseCase } from '@/domain/paylab/application/use-cases/provision-merchant'
import { INestApplication } from '@nestjs/common'

// A provisioned Merchant with its raw API key, for e2e specs that call the HTTP API.
export async function provisionMerchant(app: INestApplication, name = 'Acme') {
	const { merchantId, apiKey } = await app.get(ProvisionMerchantUseCase).execute({ name })

	return { merchantId, auth: `Bearer ${apiKey}` }
}
