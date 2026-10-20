import { z } from 'zod'

export const booleanFromString = z
	.enum(['true', 'false'])
	.default('false')
	.transform((value) => value === 'true')

export const envSchema = z.object({
	APP_NAME: z.string().default('fakebank-api'),
	LOG_ENABLED: booleanFromString,
	LOG_LEVEL: z.enum(['basic', 'debug']).default('basic'),
	DATABASE_URL: z.string().url(),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(4000),
})

export type Env = z.infer<typeof envSchema>

/** Validates the process environment; throws one message naming every invalid variable. */
export function buildEnv(input: Record<string, unknown>): Env {
	const result = envSchema.safeParse(input)

	if (!result.success) {
		const problems = result.error.issues
			.map((issue) => `${issue.path.join('.')}: ${issue.message}`)
			.join('; ')
		throw new Error(`Invalid environment configuration: ${problems}`)
	}

	return result.data
}
