import { BrazilianCepGeocoder } from '@/infra/geocoding/brazilian-cep-geocoder'
import { afterEach, describe, expect, test, vi } from 'vitest'

const AWESOME_API = 'https://awesomeapi.example.test/json'
const VIACEP = 'https://viacep.example.test/ws'
const NOMINATIM = 'https://nominatim.example.test'
const CONTACT = 'ops@quintal.test'

const ENV: Record<string, string> = {
	AWESOME_API_BASE_URL: AWESOME_API,
	AWESOME_API_TOKEN: '',
	VIACEP_BASE_URL: VIACEP,
	NOMINATIM_BASE_URL: NOMINATIM,
	NOMINATIM_CONTACT: CONTACT,
}

function buildGeocoder(overrides: Record<string, string> = {}) {
	const env = { ...ENV, ...overrides }
	return new BrazilianCepGeocoder({ get: (key: string) => env[key] ?? '' } as never)
}

type Handler = (url: string) => unknown | Promise<unknown>

function jsonOk(body: unknown, status = 200) {
	return { ok: status >= 200 && status < 300, status, json: async () => body }
}

/** Routes a mocked fetch by which host the URL targets. Unmatched hosts throw. */
function routeFetch(handlers: { awesomeApi?: Handler; viaCep?: Handler; nominatim?: Handler }) {
	return vi.fn(async (input: string | URL, _init?: RequestInit) => {
		const url = String(input)
		if (url.startsWith(AWESOME_API)) {
			if (!handlers.awesomeApi) throw new Error(`unexpected AwesomeAPI call: ${url}`)
			return handlers.awesomeApi(url)
		}
		if (url.startsWith(VIACEP)) {
			if (!handlers.viaCep) throw new Error(`unexpected ViaCEP call: ${url}`)
			return handlers.viaCep(url)
		}
		if (url.startsWith(NOMINATIM)) {
			if (!handlers.nominatim) throw new Error(`unexpected Nominatim call: ${url}`)
			return handlers.nominatim(url)
		}
		throw new Error(`unrouted fetch: ${url}`)
	})
}

describe('BrazilianCepGeocoder', () => {
	afterEach(() => vi.unstubAllGlobals())

	function install(handlers: Parameters<typeof routeFetch>[0]) {
		const fetchMock = routeFetch(handlers)
		vi.stubGlobal('fetch', fetchMock)
		return fetchMock
	}

	function calledHosts(fetchMock: ReturnType<typeof routeFetch>) {
		return fetchMock.mock.calls.map((c) => String(c[0]))
	}

	test('AwesomeAPI 200 with lat/lng → found, provider awesomeapi, no ViaCEP or Nominatim call', async () => {
		const fetchMock = install({
			awesomeApi: () =>
				jsonOk({
					cep: '06514001',
					address: 'Estrada Municipal Santo André',
					district: 'Sítio do Rosário',
					city: 'Santana de Parnaíba',
					state: 'SP',
					lat: '-23.4637666',
					lng: '-46.9199714',
				}),
		})

		expect(await buildGeocoder().resolvePostalCode('06514-001')).toEqual({
			status: 'found',
			latitude: -23.4637666,
			longitude: -46.9199714,
			provider: 'awesomeapi',
		})
		expect(calledHosts(fetchMock)).toHaveLength(1)
	})

	test('AwesomeAPI 404 {code:"not_found"} → not-found, no ViaCEP or Nominatim call', async () => {
		const fetchMock = install({
			awesomeApi: () =>
				jsonOk({ code: 'not_found', message: 'O CEP 99999999 nao foi encontrado' }, 404),
		})

		expect(await buildGeocoder().resolvePostalCode('99999-999')).toEqual({ status: 'not-found' })
		expect(calledHosts(fetchMock)).toHaveLength(1)
	})

	test('AwesomeAPI 200 with blank coordinates → ViaCEP address → Nominatim geocodes → found, provider nominatim', async () => {
		const fetchMock = install({
			awesomeApi: () =>
				jsonOk({
					cep: '24230410',
					address: '',
					district: '',
					city: '',
					state: '',
					lat: '',
					lng: '',
				}),
			viaCep: () =>
				jsonOk({
					logradouro: 'Rua Gavião Peixoto',
					bairro: 'Icaraí',
					localidade: 'Niterói',
					uf: 'RJ',
				}),
			nominatim: () => jsonOk([{ lat: '-22.9035', lon: '-43.1045' }]),
		})

		expect(await buildGeocoder().resolvePostalCode('24230-410')).toEqual({
			status: 'found',
			latitude: -22.9035,
			longitude: -43.1045,
			provider: 'nominatim',
		})
		const nominatimCall = calledHosts(fetchMock).find((u) => u.startsWith(NOMINATIM))
		expect(decodeURIComponent(nominatimCall ?? '')).toContain('Icaraí')
		expect(nominatimCall).toContain('countrycodes=br')
	})

	test('AwesomeAPI 200 with "0"/"0" coordinates → treated as a miss, ViaCEP address → Nominatim → found', async () => {
		install({
			awesomeApi: () =>
				jsonOk({
					cep: '24230410',
					address: '',
					district: '',
					city: '',
					state: '',
					lat: '0',
					lng: '0',
				}),
			viaCep: () =>
				jsonOk({
					logradouro: 'Rua Gavião Peixoto',
					bairro: 'Icaraí',
					localidade: 'Niterói',
					uf: 'RJ',
				}),
			nominatim: () => jsonOk([{ lat: '-22.9035', lon: '-43.1045' }]),
		})

		expect(await buildGeocoder().resolvePostalCode('24230-410')).toEqual({
			status: 'found',
			latitude: -22.9035,
			longitude: -43.1045,
			provider: 'nominatim',
		})
	})

	test('AwesomeAPI times out, ViaCEP { erro: true } → not-found', async () => {
		install({
			awesomeApi: () => {
				throw new Error('The operation was aborted')
			},
			viaCep: () => jsonOk({ erro: true }),
		})

		expect(await buildGeocoder().resolvePostalCode('00000-000')).toEqual({ status: 'not-found' })
	})

	test('AwesomeAPI 500, ViaCEP address, Nominatim resolves → found, provider nominatim', async () => {
		install({
			awesomeApi: () => jsonOk({ code: 'error' }, 500),
			viaCep: () =>
				jsonOk({ logradouro: 'Rua X', bairro: 'Centro', localidade: 'Niterói', uf: 'RJ' }),
			nominatim: () => jsonOk([{ lat: '-22.88', lon: '-43.10' }]),
		})

		expect(await buildGeocoder().resolvePostalCode('24020-000')).toEqual({
			status: 'found',
			latitude: -22.88,
			longitude: -43.1,
			provider: 'nominatim',
		})
	})

	test('AwesomeAPI unreachable + ViaCEP unreachable → unavailable', async () => {
		install({
			awesomeApi: () => {
				throw new Error('network down')
			},
			viaCep: () => {
				throw new Error('network down')
			},
		})

		expect(await buildGeocoder().resolvePostalCode('24230-410')).toEqual({ status: 'unavailable' })
	})

	test('CEP exists (ViaCEP address) but Nominatim finds nothing for any variant → unavailable, never not-found', async () => {
		install({
			awesomeApi: () => jsonOk({ code: 'error' }, 500),
			viaCep: () =>
				jsonOk({ logradouro: 'Rua Y', bairro: 'Bairro Z', localidade: 'Cidade W', uf: 'RJ' }),
			nominatim: () => jsonOk([]),
		})

		expect(await buildGeocoder().resolvePostalCode('24230-410')).toEqual({ status: 'unavailable' })
	})

	test('sends X-Api-Key when AWESOME_API_TOKEN is set', async () => {
		const fetchMock = install({
			awesomeApi: () => jsonOk({ lat: '-23.5', lng: '-46.6' }),
		})

		await buildGeocoder({ AWESOME_API_TOKEN: 'secret-token' }).resolvePostalCode('01310-100')

		const [, init] = fetchMock.mock.calls[0]
		const headers = new Headers((init as RequestInit).headers)
		expect(headers.get('X-Api-Key')).toBe('secret-token')
		expect(headers.get('Accept')).toBe('application/json')
	})

	test('no X-Api-Key header when AWESOME_API_TOKEN is empty', async () => {
		const fetchMock = install({
			awesomeApi: () => jsonOk({ lat: '-23.5', lng: '-46.6' }),
		})

		await buildGeocoder().resolvePostalCode('01310-100')

		const [, init] = fetchMock.mock.calls[0]
		const headers = new Headers((init as RequestInit).headers)
		expect(headers.has('X-Api-Key')).toBe(false)
	})

	test('normalizes "06514-001" → "06514001" in the AwesomeAPI URL', async () => {
		const fetchMock = install({
			awesomeApi: () => jsonOk({ lat: '-23.46', lng: '-46.91' }),
		})

		await buildGeocoder().resolvePostalCode('06514-001')

		const url = String(fetchMock.mock.calls[0][0])
		expect(url).toBe(`${AWESOME_API}/06514001`)
		expect(url).not.toContain('06514-001')
	})

	test('address geocode falls back street → neighbourhood → city until one resolves', async () => {
		const fetchMock = install({
			awesomeApi: () =>
				jsonOk({
					address: 'Rua Sem Mapa',
					district: 'Icaraí',
					city: 'Niterói',
					state: 'RJ',
					lat: '',
					lng: '',
				}),
			nominatim: (url) =>
				url.includes('Sem') ? jsonOk([]) : jsonOk([{ lat: '-22.9', lon: '-43.1' }]),
		})

		expect(await buildGeocoder().resolvePostalCode('24230-410')).toMatchObject({
			status: 'found',
			provider: 'nominatim',
		})
		const nominatimCalls = calledHosts(fetchMock).filter((u) => u.startsWith(NOMINATIM))
		expect(nominatimCalls.length).toBeGreaterThanOrEqual(2)
	})

	test('sends a User-Agent built from NOMINATIM_CONTACT', async () => {
		const fetchMock = install({
			awesomeApi: () =>
				jsonOk({
					address: 'Rua X',
					district: 'Centro',
					city: 'Niterói',
					state: 'RJ',
					lat: '',
					lng: '',
				}),
			nominatim: () => jsonOk([{ lat: '-22.9', lon: '-43.1' }]),
		})

		await buildGeocoder().resolvePostalCode('24230-410')

		const nominatimCallIndex = fetchMock.mock.calls.findIndex((c) =>
			String(c[0]).startsWith(NOMINATIM),
		)
		const [, init] = fetchMock.mock.calls[nominatimCallIndex]
		expect(new Headers((init as RequestInit).headers).get('User-Agent')).toContain(CONTACT)
	})
})
