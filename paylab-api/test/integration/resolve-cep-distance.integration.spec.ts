import { CepGeocodesRepository } from '@/domain/quintalpet/application/repositories/cep-geocodes-repository'
import { ResolveCepDistanceService } from '@/domain/quintalpet/application/use-cases/resolve-cep-distance'
import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import { ROAD_CORRECTION_FACTOR } from '@/domain/quintalpet/enterprise/services/haversine-distance'
import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { PrismaCepGeocodesRepository } from '@/infra/database/prisma/repositories/shipping/prisma-cep-geocodes-repository'
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { FakeCepGeocoder } from '../support/fake-cep-geocoder'

process.env.DATABASE_URL ??= 'postgresql://docker:docker@localhost:5432/agropet_test?schema=public'

const prisma = new PrismaService()
const repository: CepGeocodesRepository = new PrismaCepGeocodesRepository(prisma)
const geocoder = new FakeCepGeocoder()
const service = new ResolveCepDistanceService(geocoder, repository)

async function resetDatabase() {
	await prisma.cepGeocode.deleteMany()
}

describe('ResolveCepDistanceService (integration)', () => {
	beforeAll(async () => {
		await prisma.$connect()
	})

	beforeEach(async () => {
		await resetDatabase()
		geocoder.reset()
	})

	afterAll(async () => {
		await resetDatabase()
		await prisma.$disconnect()
	})

	test('uses the persistent cache and never calls the geocoder when both CEPs are cached', async () => {
		await repository.save('02010-000', { latitude: -23.5, longitude: -46.6 }, 'fake')
		await repository.save('04570-000', { latitude: -23.6, longitude: -46.7 }, 'fake')

		const distance = await service.resolveDistanceKm('02010-000', '04570-000')

		expect(distance).toBeGreaterThan(0)
		expect(geocoder.calls).toHaveLength(0)
	})

	test('on a cache miss calls the geocoder once, persists the row, and hits the cache next time', async () => {
		geocoder.setCoordinates('04570-000', -23.6, -46.7)
		await repository.save('02010-000', { latitude: -23.5, longitude: -46.6 }, 'fake')

		await service.resolveDistanceKm('02010-000', '04570-000')
		await service.resolveDistanceKm('02010-000', '04570-000')

		expect(geocoder.calls).toEqual(['04570000'])
		const persisted = await prisma.cepGeocode.findUnique({ where: { postalCode: '04570000' } })
		expect(persisted).toMatchObject({ latitude: -23.6, longitude: -46.7, provider: 'fake' })
	})

	test('on a cache miss the persisted row records the provider from the geocoder result', async () => {
		geocoder.setCoordinates('06514-001', -23.4442, -46.9178, 'awesomeapi')

		await service.resolveCoordinates('06514-001')

		const persisted = await prisma.cepGeocode.findUnique({ where: { postalCode: '06514001' } })
		expect(persisted).toMatchObject({
			latitude: -23.4442,
			longitude: -46.9178,
			provider: 'awesomeapi',
		})
	})

	test('applies the road-correction factor to the straight-line distance', async () => {
		geocoder.setCoordinates('00000-001', 0, 0)
		geocoder.setCoordinates('00000-002', 0, 1)

		const distance = await service.resolveDistanceKm('00000-001', '00000-002')

		// One degree of longitude at the equator ~ 111.19 km straight-line.
		expect(distance).toBeGreaterThan(111 * ROAD_CORRECTION_FACTOR - 1)
		expect(distance).toBeLessThan(111.4 * ROAD_CORRECTION_FACTOR + 1)
	})

	test('a well-formed CEP the geocoder cannot find is an InvalidPostalCodeError', async () => {
		await repository.save('02010-000', { latitude: -23.5, longitude: -46.6 }, 'fake')
		geocoder.setNotFound('99999-999')

		await expect(service.resolveDistanceKm('02010-000', '99999-999')).rejects.toBeInstanceOf(
			InvalidPostalCodeError,
		)
	})

	test('a geocoder outage is a GeocoderUnavailableError, not a CEP error', async () => {
		await repository.save('02010-000', { latitude: -23.5, longitude: -46.6 }, 'fake')
		geocoder.setUnavailable('04570-000')

		await expect(service.resolveDistanceKm('02010-000', '04570-000')).rejects.toBeInstanceOf(
			GeocoderUnavailableError,
		)
	})

	test('a malformed CEP is rejected without calling the geocoder', async () => {
		await repository.save('02010-000', { latitude: -23.5, longitude: -46.6 }, 'fake')

		await expect(service.resolveDistanceKm('02010-000', '123')).rejects.toBeInstanceOf(
			InvalidPostalCodeError,
		)
		expect(geocoder.calls).toHaveLength(0)
	})
})
