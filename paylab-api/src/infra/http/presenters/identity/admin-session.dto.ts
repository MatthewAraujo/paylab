import { ApiProperty } from '@nestjs/swagger'

export class CurrentAdminDto {
	@ApiProperty()
	id!: string

	@ApiProperty()
	name!: string

	@ApiProperty()
	email!: string
}

export class CurrentStoreDto {
	@ApiProperty()
	id!: string

	@ApiProperty()
	name!: string

	@ApiProperty()
	slug!: string

	@ApiProperty()
	timezone!: string
}

export class CurrentAdminProfileResponseDto {
	@ApiProperty({ type: CurrentAdminDto })
	admin!: CurrentAdminDto

	@ApiProperty({ type: CurrentStoreDto })
	store!: CurrentStoreDto
}
