import { externalReference } from '@/infra/transactions/transaction.schemas'
import { z } from 'zod'
import { OUTCOMES } from './outcome'

export const MAX_DELAY_MS = 120_000

// AC-13: impossible combinations are refused (400) instead of stored. Unknown fields are stripped.
export const registerScenarioBody = z
	.object({
		externalReference,
		outcome: z.enum(OUTCOMES),
		delayMs: z.number().int().min(0).max(MAX_DELAY_MS).default(0),
		failureCode: z
			.string()
			.max(64)
			.transform((value) => value.trim())
			.refine((value) => value.length > 0, 'Must not be blank')
			.optional(),
		retryAfterSeconds: z.number().int().min(1).max(3600).optional(),
		times: z.number().int().min(1).max(100).default(1),
	})
	.superRefine((body, context) => {
		if (body.outcome === 'FAIL' && body.failureCode === undefined) {
			context.addIssue({ code: 'custom', path: ['failureCode'], message: 'Required for FAIL' })
		}
		if (body.outcome !== 'FAIL' && body.failureCode !== undefined) {
			context.addIssue({ code: 'custom', path: ['failureCode'], message: 'Only allowed for FAIL' })
		}
		if (body.outcome !== 'RATE_LIMIT' && body.retryAfterSeconds !== undefined) {
			context.addIssue({
				code: 'custom',
				path: ['retryAfterSeconds'],
				message: 'Only allowed for RATE_LIMIT',
			})
		}
	})

export type RegisterScenarioBody = z.infer<typeof registerScenarioBody>
