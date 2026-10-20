import { ApiProperty } from '@nestjs/swagger'

/** Documentation-only shape of every error response; the runtime source is ErrorEnvelopeFilter. */
export class ErrorEnvelopeResponse {
	@ApiProperty({ example: 'TRANSACTION_NOT_FOUND', description: 'Stable machine-readable code.' })
	code!: string

	@ApiProperty({ example: 'The requested Provider Transaction was not found.' })
	message!: string

	@ApiProperty({ description: 'True exactly for 429, 500 and 503: the Client may retry.' })
	retryable!: boolean

	@ApiProperty({
		example: '0b5e8f0e-7c1d-4a8e-9a4f-3f1e2d6c9b7a',
		description:
			'The caller X-Request-Id when sent, otherwise generated; also in the X-Request-Id header.',
	})
	requestId!: string
}
