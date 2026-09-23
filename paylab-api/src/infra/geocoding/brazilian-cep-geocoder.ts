import { CepGeocoder, GeocodeResult } from '@/domain/quintalpet/application/gateways/cep-geocoder'
import { EnvService } from '@/infra/env/env.service'
import { Injectable, Logger } from '@nestjs/common'

const REQUEST_TIMEOUT_MS = 4000

interface CepAddress {
	street: string
	neighborhood: string
	city: string
	state: string
}

interface AwesomeApiCep {
	address?: string | null
	address_name?: string | null
	district?: string | null
	city?: string | null
	state?: string | null
	lat?: string | number | null
	lng?: string | number | null
	code?: string | null
}

interface ViaCepResponse {
	logradouro?: string
	bairro?: string
	localidade?: string
	uf?: string
	erro?: boolean
}

interface NominatimSearchResult {
	lat: string
	lon: string
}

/**
 * Turns a Brazilian CEP into coordinates, resiliently:
 *
 *  1. **AwesomeAPI** (`{AWESOME_API_BASE_URL}/{cep}`) — returns per-street
 *     `lat`/`lng` directly. `200` with finite, non-zero coordinates →
 *     `found` (`provider: 'awesomeapi'`). `404` with `code: "not_found"` →
 *     `not-found`, authoritative — the rest of the cascade is skipped. `200`
 *     with blank/zero coordinates (single-CEP towns) → coordinate miss, its
 *     address fields feed step 3. Timeout / network error / other non-2xx →
 *     fall through with no address.
 *  2. **ViaCEP** — fallback address lookup and the authority on non-existence:
 *     `{ "erro": true }` yields `not-found`. Its address feeds step 3.
 *  3. **Nominatim** — geocodes the address string (street → neighborhood →
 *     city) when no registry gave coordinates; on success →
 *     `found` (`provider: 'nominatim'`).
 *
 * A CEP that provably exists but that no service can place is `unavailable`
 * (transient — "tente novamente"), never `not-found` — we don't tell a shopper
 * their real CEP is wrong because OpenStreetMap has a gap.
 */
@Injectable()
export class BrazilianCepGeocoder implements CepGeocoder {
	private readonly logger = new Logger(BrazilianCepGeocoder.name)
	private readonly nominatimBaseUrl: string
	private readonly awesomeApiBaseUrl: string
	private readonly awesomeApiToken: string
	private readonly viaCepBaseUrl: string
	private readonly userAgent: string

	constructor(envService: EnvService) {
		this.nominatimBaseUrl = (
			envService.get('NOMINATIM_BASE_URL') || 'https://nominatim.openstreetmap.org'
		).replace(/\/$/, '')
		this.awesomeApiBaseUrl = (
			envService.get('AWESOME_API_BASE_URL') || 'https://cep.awesomeapi.com.br/json'
		).replace(/\/$/, '')
		this.awesomeApiToken = envService.get('AWESOME_API_TOKEN') || ''
		this.viaCepBaseUrl = (envService.get('VIACEP_BASE_URL') || 'https://viacep.com.br/ws').replace(
			/\/$/,
			'',
		)

		const contact = envService.get('NOMINATIM_CONTACT') || 'no-contact-configured'
		this.userAgent = `quintal-agro-pet/1.0 (${contact})`
	}

	async resolvePostalCode(postalCode: string): Promise<GeocodeResult> {
		const digits = postalCode.replace(/\D/g, '')

		const fromAwesomeApi = await this.lookupAwesomeApi(digits)
		if (fromAwesomeApi.kind === 'coordinates') {
			return {
				status: 'found',
				latitude: fromAwesomeApi.latitude,
				longitude: fromAwesomeApi.longitude,
				provider: 'awesomeapi',
			}
		}
		// AwesomeAPI's `404 not_found` is authoritative — skip the rest of the
		// cascade, even if ViaCEP would be unreachable.
		if (fromAwesomeApi.kind === 'not-found') return { status: 'not-found' }

		let address = fromAwesomeApi.kind === 'address' ? fromAwesomeApi.address : null

		if (!address) {
			const fromViaCep = await this.lookupViaCep(digits)
			if (fromViaCep.kind === 'not-found') return { status: 'not-found' }
			if (fromViaCep.kind === 'address') address = fromViaCep.address
		}

		if (!address) {
			// Neither registry could be reached and neither confirmed non-existence.
			this.logger.warn(`No CEP registry could be reached for ${digits}`)
			return { status: 'unavailable' }
		}

		const geocoded = await this.geocodeAddress(address)
		if (geocoded) return { status: 'found', ...geocoded, provider: 'nominatim' }

		this.logger.warn(
			`CEP ${digits} exists (${address.city}/${address.state}) but could not be geocoded`,
		)
		return { status: 'unavailable' }
	}

	private async lookupAwesomeApi(
		digits: string,
	): Promise<
		| { kind: 'not-found' }
		| { kind: 'coordinates'; latitude: number; longitude: number }
		| { kind: 'address'; address: CepAddress }
		| { kind: 'fall-through' }
	> {
		try {
			const response = await this.getJson(
				`${this.awesomeApiBaseUrl}/${digits}`,
				this.awesomeApiHeaders(),
			)

			if (response.status === 404) {
				const body = (await response.json().catch(() => null)) as AwesomeApiCep | null
				if (body?.code === 'not_found') return { kind: 'not-found' }
				this.logger.warn(`AwesomeAPI responded 404 without not_found for CEP ${digits}`)
				return { kind: 'fall-through' }
			}
			if (!response.ok) {
				this.logger.warn(`AwesomeAPI responded ${response.status} for CEP ${digits}`)
				return { kind: 'fall-through' }
			}

			const body = (await response.json()) as AwesomeApiCep
			const latitude = Number(body.lat)
			const longitude = Number(body.lng)
			if (
				Number.isFinite(latitude) &&
				Number.isFinite(longitude) &&
				(latitude !== 0 || longitude !== 0)
			) {
				return { kind: 'coordinates', latitude, longitude }
			}

			const address: CepAddress = {
				street: (body.address ?? body.address_name ?? '').trim(),
				neighborhood: (body.district ?? '').trim(),
				city: (body.city ?? '').trim(),
				state: (body.state ?? '').trim(),
			}
			if (Object.values(address).some((part) => part.length > 0)) {
				return { kind: 'address', address }
			}

			return { kind: 'fall-through' }
		} catch (error) {
			this.logger.warn(`AwesomeAPI request failed for CEP ${digits}: ${String(error)}`)
			return { kind: 'fall-through' }
		}
	}

	private async lookupViaCep(
		digits: string,
	): Promise<
		{ kind: 'not-found' } | { kind: 'address'; address: CepAddress } | { kind: 'unavailable' }
	> {
		try {
			const response = await this.getJson(`${this.viaCepBaseUrl}/${digits}/json/`, {
				'User-Agent': this.userAgent,
				Accept: 'application/json',
			})
			if (!response.ok) {
				this.logger.warn(`ViaCEP responded ${response.status} for CEP ${digits}`)
				return { kind: 'unavailable' }
			}

			const body = (await response.json()) as ViaCepResponse
			if (body.erro) return { kind: 'not-found' }

			return {
				kind: 'address',
				address: {
					street: body.logradouro ?? '',
					neighborhood: body.bairro ?? '',
					city: body.localidade ?? '',
					state: body.uf ?? '',
				},
			}
		} catch (error) {
			this.logger.warn(`ViaCEP request failed for CEP ${digits}: ${String(error)}`)
			return { kind: 'unavailable' }
		}
	}

	private async geocodeAddress(
		address: CepAddress,
	): Promise<{ latitude: number; longitude: number } | null> {
		const queries = [
			[address.street, address.neighborhood, address.city, address.state],
			[address.neighborhood, address.city, address.state],
			[address.city, address.state],
		]
			.map((parts) => parts.filter((part) => part.trim().length > 0).join(', '))
			.filter((query, index, all) => query.length > 0 && all.indexOf(query) === index)

		for (const query of queries) {
			const url = new URL(`${this.nominatimBaseUrl}/search`)
			url.searchParams.set('q', `${query}, Brazil`)
			url.searchParams.set('countrycodes', 'br')
			url.searchParams.set('format', 'json')
			url.searchParams.set('limit', '1')

			try {
				const response = await this.getJson(url, {
					'User-Agent': this.userAgent,
					Accept: 'application/json',
				})
				if (!response.ok) {
					this.logger.warn(`Nominatim responded ${response.status} for "${query}"`)
					return null
				}

				const body = (await response.json()) as NominatimSearchResult[]
				const first = Array.isArray(body) ? body[0] : undefined
				if (!first) continue

				const latitude = Number(first.lat)
				const longitude = Number(first.lon)
				if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
					return { latitude, longitude }
				}
			} catch (error) {
				this.logger.warn(`Nominatim request failed for "${query}": ${String(error)}`)
				return null
			}
		}

		return null
	}

	private awesomeApiHeaders(): Record<string, string> {
		const headers: Record<string, string> = { Accept: 'application/json' }
		if (this.awesomeApiToken) headers['X-Api-Key'] = this.awesomeApiToken
		return headers
	}

	private async getJson(url: string | URL, headers: Record<string, string>): Promise<Response> {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
		try {
			return await fetch(url, {
				headers,
				signal: controller.signal,
			})
		} finally {
			clearTimeout(timeout)
		}
	}
}
