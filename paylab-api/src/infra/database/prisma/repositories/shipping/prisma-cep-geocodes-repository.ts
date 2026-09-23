import {
	CepCoordinates,
	CepGeocodesRepository,
} from '@/domain/quintalpet/application/repositories/cep-geocodes-repository'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

function normalize(postalCode: string): string {
	return postalCode.replace(/\D/g, '')
}

@Injectable()
export class PrismaCepGeocodesRepository implements CepGeocodesRepository {
	constructor(private readonly prisma: PrismaService) {}

	async findByPostalCode(postalCode: string): Promise<CepCoordinates | null> {
		const record = await this.prisma.cepGeocode.findUnique({
			where: { postalCode: normalize(postalCode) },
		})

		return record ? { latitude: record.latitude, longitude: record.longitude } : null
	}

	async save(postalCode: string, coordinates: CepCoordinates, provider: string): Promise<void> {
		const key = normalize(postalCode)

		await this.prisma.cepGeocode.upsert({
			where: { postalCode: key },
			create: {
				postalCode: key,
				latitude: coordinates.latitude,
				longitude: coordinates.longitude,
				provider,
			},
			update: {
				latitude: coordinates.latitude,
				longitude: coordinates.longitude,
				provider,
				resolvedAt: new Date(),
			},
		})
	}
}
