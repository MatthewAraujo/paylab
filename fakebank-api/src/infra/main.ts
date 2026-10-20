import 'dotenv/config'
import { createApp } from './app.factory'
import { EnvService } from './env/env.service'

async function bootstrap() {
	const app = await createApp()
	const port = app.get(EnvService).get('PORT')

	await app.listen(port)
}
bootstrap()
