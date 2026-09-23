import { EnvService } from '@/infra/env/env.service'
import { Controller, Get } from '@nestjs/common'
import { AllowAnonymous } from '@thallesp/nestjs-better-auth'

@Controller('health')
@AllowAnonymous()
export class HealthController {
	constructor(private readonly envService: EnvService) {}

	@Get()
	handle() {
		return {
			status: 'ok',
			app: this.envService.get('APP_NAME'),
			environment: this.envService.get('NODE_ENV'),
		}
	}
}
