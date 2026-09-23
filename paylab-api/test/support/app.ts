import { AppModule } from '@/infra/app.module'
import { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'

// Boots the real AppModule against the Testcontainers database. The caller closes it.
export async function buildTestApp(): Promise<INestApplication> {
	const moduleRef = await Test.createTestingModule({
		imports: [AppModule],
	}).compile()
	const app = moduleRef.createNestApplication()

	await app.init()

	return app
}
