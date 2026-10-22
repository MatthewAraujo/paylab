import { inject } from 'vitest'
import { TEST_FAKEBANK_CLIENTS } from './clients'

process.env.APP_NAME ??= 'fakebank-api'
process.env.NODE_ENV ??= 'test'
process.env.PORT ??= '4000'
// Unit specs never connect; the value only has to satisfy the env schema.
process.env.DATABASE_URL ??= 'postgresql://fakebank:fakebank@localhost:5434/fakebank_test'
// Hashes of the test keys in clients.ts; never a developer's real configuration.
process.env.FAKEBANK_CLIENTS = TEST_FAKEBANK_CLIENTS

// Database layers get the Testcontainers URL from the global setup, which wins
// over the placeholder above and over any developer `.env`.
const databaseUrl = inject('databaseUrl')
if (databaseUrl) {
	process.env.DATABASE_URL = databaseUrl
}
