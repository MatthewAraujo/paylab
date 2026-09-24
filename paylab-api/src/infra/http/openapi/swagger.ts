import { INestApplication } from '@nestjs/common'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

/** The OpenAPI document served at `/docs-json` and consumed by the Operational Console. */
export function buildOpenApiDocument(app: INestApplication) {
	const config = new DocumentBuilder()
		.setTitle('PayLab API')
		.setDescription('Payment processing and double-entry ledger lab.')
		.setVersion('0.0.1')
		.addBearerAuth()
		.build()

	return SwaggerModule.createDocument(app, config)
}
