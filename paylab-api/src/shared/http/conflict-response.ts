import { ConflictException } from '@nestjs/common'
import { ApiProperty } from '@nestjs/swagger'

export class ConflictResponseDto {
	@ApiProperty({ example: 409 })
	statusCode!: number

	@ApiProperty({ example: 'Conflict' })
	error!: string

	@ApiProperty({
		example: 'A collectible invoice already exists for this member and reference month.',
	})
	message!: string

	@ApiProperty({ example: 'collectible_invoice_already_exists' })
	code!: string
}

export function createCodeConflictException(code: string, message: string): ConflictException {
	return new ConflictException({
		statusCode: 409,
		error: 'Conflict',
		message,
		code,
	})
}
