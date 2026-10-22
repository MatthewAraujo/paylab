import { z } from 'zod'

export const booleanFromString = z
	.enum(['true', 'false'])
	.default('false')
	.transform((value) => value === 'true')

export interface ClientCredential {
	clientId: string
	/** Lowercase hex SHA-256 of the Client's API key; the key itself is never configured. */
	keyHash: string
}

const CLIENT_ID = /^[A-Za-z0-9_-]{1,64}$/
const SHA256_HEX = /^[0-9a-fA-F]{64}$/

// AC-34: `clientId:sha256-hex-of-key`, comma-separated. Malformed or ambiguous entries
// refuse the boot; entry values are never echoed, so a pasted plaintext key never reaches logs.
export const clientCredentials = z
	.string({ required_error: 'Required (comma-separated clientId:sha256-hex-of-key)' })
	.transform((value, context): ClientCredential[] => {
		const entries = value
			.split(',')
			.map((entry) => entry.trim())
			.filter((entry) => entry.length > 0)
		const credentials: ClientCredential[] = []

		if (entries.length === 0) {
			context.addIssue({ code: 'custom', message: 'At least one Client is required' })
			return z.NEVER
		}
		for (const [index, entry] of entries.entries()) {
			const [clientId, keyHash, ...rest] = entry.split(':')
			if (rest.length > 0 || !CLIENT_ID.test(clientId) || !SHA256_HEX.test(keyHash ?? '')) {
				context.addIssue({
					code: 'custom',
					message: `Entry ${index + 1} must be clientId:sha256-hex-of-key`,
				})
				return z.NEVER
			}
			credentials.push({ clientId, keyHash: keyHash.toLowerCase() })
		}
		if (new Set(credentials.map((c) => c.clientId)).size !== credentials.length) {
			context.addIssue({ code: 'custom', message: 'Client ids must be unique' })
			return z.NEVER
		}
		if (new Set(credentials.map((c) => c.keyHash)).size !== credentials.length) {
			context.addIssue({ code: 'custom', message: 'Key hashes must be unique' })
			return z.NEVER
		}
		return credentials
	})

export const envSchema = z.object({
	APP_NAME: z.string().default('fakebank-api'),
	LOG_ENABLED: booleanFromString,
	LOG_LEVEL: z.enum(['basic', 'debug']).default('basic'),
	DATABASE_URL: z.string().url(),
	NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
	PORT: z.coerce.number().int().positive().default(4000),
	FAKEBANK_CLIENTS: clientCredentials,
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
