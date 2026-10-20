import { EnvService } from '@/infra/env/env.service'
import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiTags } from '@nestjs/swagger'

// Liveness only: public and independent of the database (no `/ready` in October).
@ApiTags('health')
@Controller('health')
export class HealthController {
	constructor(private readonly envService: EnvService) {}

	@Get()
	@ApiOkResponse({ description: 'The service is up.' })
	handle() {
		return {
			status: 'ok',
			app: this.envService.get('APP_NAME'),
			environment: this.envService.get('NODE_ENV'),
		}
	}
}
