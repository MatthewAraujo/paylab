import { AppModule } from '@/infra/app.module'
import { INestApplication } from '@nestjs/common'
import { Test, TestingModuleBuilder } from '@nestjs/testing'

// Boots the real AppModule against the Testcontainers database. The caller closes it.
// `configure` can override providers, e.g. the benchmark configuration.
export async function buildTestApp(
	configure: (builder: TestingModuleBuilder) => TestingModuleBuilder = (builder) => builder,
): Promise<INestApplication> {
	const moduleRef = await configure(
		Test.createTestingModule({
			imports: [AppModule],
		}),
	).compile()
	const app = moduleRef.createNestApplication()

	await app.init()

	return app
}
