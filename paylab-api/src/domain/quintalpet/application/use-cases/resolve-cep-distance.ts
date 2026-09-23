import { GeocoderUnavailableError } from '@/domain/quintalpet/enterprise/errors/geocoder-unavailable-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import {
	ROAD_CORRECTION_FACTOR,
	haversineKm,
} from '@/domain/quintalpet/enterprise/services/haversine-distance'
import { Injectable } from '@nestjs/common'
import { CepGeocoder } from '../gateways/cep-geocoder'
import { CepCoordinates, CepGeocodesRepository } from '../repositories/cep-geocodes-repository'

/**
 * Resolves one or two CEPs to coordinates — cache first, geocoder on a miss,
 * persisting every fresh lookup — and computes the road-corrected straight-line
 * distance between them.
 *
 * Error signals:
 *  - malformed CEP (not 8 digits) or geocoder `not-found` -> `InvalidPostalCodeError`
 *  - geocoder `unavailable` -> `GeocoderUnavailableError` (transient)
 */
@Injectable()
export class ResolveCepDistanceService {
	constructor(
		private readonly geocoder: CepGeocoder,
		private readonly cepGeocodesRepository: CepGeocodesRepository,
	) {}

	async resolveCoordinates(postalCode: string): Promise<CepCoordinates> {
		const digits = (postalCode ?? '').replace(/\D/g, '')
		if (digits.length !== 8) {
			throw new InvalidPostalCodeError()
		}

		const cached = await this.cepGeocodesRepository.findByPostalCode(digits)
		if (cached) {
			return cached
		}

		const result = await this.geocoder.resolvePostalCode(digits)
		if (result.status === 'not-found') {
			throw new InvalidPostalCodeError()
		}
		if (result.status === 'unavailable') {
			throw new GeocoderUnavailableError()
		}

		const coordinates: CepCoordinates = {
			latitude: result.latitude,
			longitude: result.longitude,
		}
		await this.cepGeocodesRepository.save(digits, coordinates, result.provider)
		return coordinates
	}

	async resolveDistanceKm(
		originPostalCode: string,
		destinationPostalCode: string,
	): Promise<number> {
		// Sequential on purpose: the origin CEP is almost always already cached
		// (seeded by the admin PUT), so this is usually a single indexed read and
		// at most one geocoder call for the customer CEP.
		const origin = await this.resolveCoordinates(originPostalCode)
		const destination = await this.resolveCoordinates(destinationPostalCode)

		return haversineKm(origin, destination) * ROAD_CORRECTION_FACTOR
	}
}
