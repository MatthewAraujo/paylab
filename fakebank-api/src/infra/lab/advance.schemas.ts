import { failureCode } from '@/infra/scenarios/scenario.schemas'
import { z } from 'zod'

export const ADVANCE_STATUSES = ['SUCCEEDED', 'FAILED'] as const

/** A valid decision: FAILED carries its Failure Code, SUCCEEDED none. */
export type AdvanceBody =
	| { status: 'SUCCEEDED'; failureCode?: undefined }
	| { status: 'FAILED'; failureCode: string }

// AC-24: only a terminal decision can be requested; FAILED needs a Failure Code and SUCCEEDED
// refuses one (400 instead of storing an impossible decision). Unknown fields are stripped.
export const advanceBody = z
	.object({
		status: z.enum(ADVANCE_STATUSES),
		failureCode: failureCode.optional(),
	})
	.superRefine((body, context): body is AdvanceBody => {
		if (body.status === 'FAILED' && body.failureCode === undefined) {
			context.addIssue({ code: 'custom', path: ['failureCode'], message: 'Required for FAILED' })
		}
		if (body.status !== 'FAILED' && body.failureCode !== undefined) {
			context.addIssue({
				code: 'custom',
				path: ['failureCode'],
				message: 'Only allowed for FAILED',
			})
		}
		return (body.status === 'FAILED') === (body.failureCode !== undefined)
	})
