import { configureApp } from '@/infra/app.factory'
import { AppModule } from '@/infra/app.module'
import { INestApplication, Type } from '@nestjs/common'
import { Test, TestingModuleBuilder } from '@nestjs/testing'

export interface BuildTestAppOptions {
	/** Overrides providers, e.g. `(builder) => builder.overrideProvider(X).useValue(y)`. */
	configure?: (builder: TestingModuleBuilder) => TestingModuleBuilder
	/** Test-only controllers mounted next to the real ones, e.g. one that throws. */
	controllers?: Type[]
}

// Boots the real AppModule against the Testcontainers database, with the same HTTP
// configuration as `main.ts` (error envelope, request id, Swagger). The caller closes it.
export async function buildTestApp(options: BuildTestAppOptions = {}): Promise<INestApplication> {
	const { configure = (builder) => builder, controllers = [] } = options
	const moduleRef = await configure(
		Test.createTestingModule({
			imports: [AppModule],
			controllers,
		}),
	).compile()
	const app = moduleRef.createNestApplication({ logger: false })

	configureApp(app)
	await app.init()

	return app
}
