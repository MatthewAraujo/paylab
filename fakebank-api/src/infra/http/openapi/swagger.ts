import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ErrorEnvelopeResponse } from './error-envelope.response'

/** Mounts the Swagger UI at `/docs` and the OpenAPI document at `/docs-json`. */
export function setupOpenApi(app: INestApplication) {
	const config = new DocumentBuilder()
		.setTitle('FakeBank API')
		.setDescription(
			'A fictional external payment provider simulating realistic provider behavior on simulated data.',
		)
		.setVersion('0.0.1')
		.addBearerAuth()
		.build()
	const document = SwaggerModule.createDocument(app, config, {
		extraModels: [ErrorEnvelopeResponse],
	})

	SwaggerModule.setup('docs', app, document, { jsonDocumentUrl: 'docs-json' })
}
