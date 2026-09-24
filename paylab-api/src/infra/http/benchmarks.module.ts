import { BenchmarkStore } from '@/infra/benchmark/benchmark-store'
import {
	BENCHMARK_CONFIG,
	type BenchmarkConfig,
	benchmarkConfigFromEnv,
} from '@/infra/benchmark/benchmark.config'
import { EnvModule } from '@/infra/env/env.module'
import { EnvService } from '@/infra/env/env.service'
import { Module } from '@nestjs/common'
import { BenchmarkEnabledGuard } from './benchmark-enabled.guard'
import { BenchmarksController } from './controllers/benchmarks.controller'

// A local developer surface: no financial authentication, no benchmark database, only files.
@Module({
	imports: [EnvModule],
	controllers: [BenchmarksController],
	providers: [
		{ provide: BENCHMARK_CONFIG, useFactory: benchmarkConfigFromEnv, inject: [EnvService] },
		{
			provide: BenchmarkStore,
			useFactory: (config: BenchmarkConfig) => new BenchmarkStore(config.paths),
			inject: [BENCHMARK_CONFIG],
		},
		BenchmarkEnabledGuard,
	],
})
export class BenchmarksModule {}
