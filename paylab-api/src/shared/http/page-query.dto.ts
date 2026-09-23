import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsInt, Max, Min } from 'class-validator'

export class PageQueryDto {
	@ApiPropertyOptional({
		description: '1-based page number.',
		type: Number,
		example: 1,
		default: 1,
		minimum: 1,
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	page = 1

	@ApiPropertyOptional({
		description: 'Maximum number of items per page.',
		type: Number,
		example: 20,
		default: 20,
		minimum: 1,
		maximum: 100,
	})
	@Type(() => Number)
	@IsInt()
	@Min(1)
	@Max(100)
	pageSize = 20
}
