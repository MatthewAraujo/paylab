import { EnvModule } from '@/infra/env/env.module'
import { EnvService } from '@/infra/env/env.service'
import { AppLogger } from '@/infra/observability/app-logger'
import { HttpLoggingInterceptor } from '@/infra/observability/http-logging.interceptor'
import { RequestContextService } from '@/infra/observability/request-context'
import { Global, Module } from '@nestjs/common'

@Global()
@Module({
	imports: [EnvModule],
	providers: [
		RequestContextService,
		{
			provide: AppLogger,
			inject: [EnvService, RequestContextService],
			useFactory: (envService: EnvService, requestContext: RequestContextService) =>
				new AppLogger(
					{
						enabled: envService.get('LOG_ENABLED') as boolean,
						level: envService.get('LOG_LEVEL') as 'basic' | 'debug',
						appName: envService.get('APP_NAME'),
						environment: envService.get('NODE_ENV'),
					},
					() => requestContext.get(),
				),
		},
		HttpLoggingInterceptor,
	],
	exports: [AppLogger, HttpLoggingInterceptor, RequestContextService],
})
export class ObservabilityModule {}
