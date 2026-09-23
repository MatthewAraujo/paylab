import 'dotenv/config'
import { ProvisionMerchantUseCase } from '@/domain/paylab/application/use-cases/provision-merchant'
import { PrismaService } from '@/infra/database/prisma.service'
import { PrismaMerchantsRepository } from '@/infra/database/repositories/prisma-merchants-repository'

const USAGE = 'Usage: pnpm merchant:provision <merchantName>'

/**
 * CLI to onboard a Merchant: creates it with a fresh API key and prints the key
 * once. Only the key's hash is stored, so a lost key cannot be recovered.
 * Returns false when the arguments are invalid.
 */
export async function provisionMerchant(
	args: string[],
	prisma: PrismaService,
	print: (line: string) => void,
): Promise<boolean> {
	const name = args.join(' ').trim()

	if (!name) {
		print(USAGE)
		return false
	}

	const provision = new ProvisionMerchantUseCase(new PrismaMerchantsRepository(prisma))
	const { merchantId, apiKey } = await provision.execute({ name })

	print(`Merchant "${name}" created (${merchantId}).`)
	print(`API key (shown once, store it now): ${apiKey}`)

	return true
}

async function main() {
	const prisma = new PrismaService()

	try {
		const ok = await provisionMerchant(process.argv.slice(2), prisma, console.log)
		if (!ok) {
			process.exitCode = 1
		}
	} finally {
		await prisma.$disconnect()
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error)
		process.exitCode = 1
	})
}
