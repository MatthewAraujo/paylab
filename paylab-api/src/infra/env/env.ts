import { z } from 'zod'

export const booleanFromString = z
	.enum(['true', 'false'])
	.default('false')
	.transform((value) => value === 'true')

export const envSchema = z.object({
	APP_NAME: z.string().default('paylab-api'),
	LOG_ENABLED: booleanFromString,
	LOG_LEVEL: z.enum(['basic', 'debug']).default('basic'),
	DATABASE_URL: z.string().url(),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(3333),
})

export type Env = z.infer<typeof envSchema>

export function buildEnv(input: Record<string, unknown>) {
	return envSchema.parse(input)
}
