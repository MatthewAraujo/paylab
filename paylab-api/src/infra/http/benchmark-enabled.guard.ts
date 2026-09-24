import { BENCHMARK_CONFIG, type BenchmarkConfig } from '@/infra/benchmark/benchmark.config'
import { CanActivate, Inject, Injectable, NotFoundException } from '@nestjs/common'

/**
 * Benchmark evidence (logs, Baseline control) is a local developer surface. When the capability
 * is off the routes behave as if they did not exist, and reveal nothing about the evidence.
 */
@Injectable()
export class BenchmarkEnabledGuard implements CanActivate {
	constructor(@Inject(BENCHMARK_CONFIG) private readonly config: BenchmarkConfig) {}

	canActivate(): boolean {
		if (!this.config.enabled) {
			throw new NotFoundException()
		}
		return true
	}
}
