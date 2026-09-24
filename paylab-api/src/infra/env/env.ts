import { z } from 'zod'

export const booleanFromString = z
	.enum(['true', 'false'])
	.default('false')
	.transform((value) => value === 'true')

const baseEnvSchema = z.object({
	APP_NAME: z.string().default('paylab-api'),
	LOG_ENABLED: booleanFromString,
	LOG_LEVEL: z.enum(['basic', 'debug']).default('basic'),
	DATABASE_URL: z.string().url(),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(3333),
	// Benchmark observability is a local developer surface (logs, control of a Baseline): on by
	// default only in development, and never allowed in production.
	BENCHMARK_ENABLED: z.enum(['true', 'false']).optional(),
	// Versioned Summaries and local Artifacts written by `pnpm benchmark:run`, relative to the working directory.
	BENCH_SUMMARY_DIR: z.string().min(1).default('bench/results'),
	BENCH_ARTIFACT_ROOT: z.string().min(1).default('.benchmark'),
})

export const envSchema = baseEnvSchema
	.superRefine((env, ctx) => {
		if (env.NODE_ENV === 'production' && env.BENCHMARK_ENABLED === 'true') {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['BENCHMARK_ENABLED'],
				message: 'The benchmark surface must not be enabled in production.',
			})
		}
	})
	.transform((env) => ({
		...env,
		BENCHMARK_ENABLED:
			env.BENCHMARK_ENABLED === undefined
				? env.NODE_ENV === 'development'
				: env.BENCHMARK_ENABLED === 'true',
	}))

export type Env = z.infer<typeof envSchema>

export function buildEnv(input: Record<string, unknown>) {
	return envSchema.parse(input)
}
