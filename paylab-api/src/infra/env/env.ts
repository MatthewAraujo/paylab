import { z } from 'zod'

export const booleanFromString = z
	.enum(['true', 'false'])
	.default('false')
	.transform((value) => value === 'true')

export const envSchema = z.object({
	APP_NAME: z.string().default('quintal-agro-pet'),
	LOG_ENABLED: booleanFromString,
	LOG_LEVEL: z.enum(['basic', 'debug']).default('basic'),
	DATABASE_URL: z.string().url(),
	REDIS_HOST: z.string().default('127.0.0.1'),
	REDIS_PORT: z.coerce.number().int().nonnegative().default(6379),
	REDIS_DB: z.coerce.number().int().nonnegative().default(0),
	CLOUDFLARE_ACCOUNT_ID: z.string().default(''),
	AWS_ACCESS_KEY_ID: z.string().default(''),
	AWS_SECRET_ACCESS_KEY: z.string().default(''),
	AWS_BUCKET_NAME: z.string().default(''),
	R2_PUBLIC_URL: z.string().default(''),
	DISABLE_R2_UPLOADS: booleanFromString,
	DISABLE_TRANSACTIONAL_EMAILS: booleanFromString,
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(3333),
	// Distance-based delivery fee (ADR 0007 / ADR 0012). A CEP is resolved to
	// coordinates by AwesomeAPI first (`cep.awesomeapi.com.br`, street-level
	// lat/lng, and the authority on "does this CEP exist?" via `404 not_found`),
	// falling back to ViaCEP for the address and Nominatim to geocode that
	// address. AWESOME_API_TOKEN is optional — sent as `X-Api-Key` when set; the
	// endpoint works keyless. The persistent CepGeocode cache keeps calls well
	// under Nominatim's ~1 req/s public limit; NOMINATIM_CONTACT is put in the
	// User-Agent per its usage policy (set a real contact in prod).
	NOMINATIM_BASE_URL: z.string().url().default('https://nominatim.openstreetmap.org'),
	NOMINATIM_CONTACT: z.string().default(''),
	AWESOME_API_BASE_URL: z.string().url().default('https://cep.awesomeapi.com.br/json'),
	AWESOME_API_TOKEN: z.string().default(''),
	VIACEP_BASE_URL: z.string().url().default('https://viacep.com.br/ws'),
})

export type Env = z.infer<typeof envSchema>

export function buildEnv(input: Record<string, unknown>) {
	return envSchema.parse(input)
}
