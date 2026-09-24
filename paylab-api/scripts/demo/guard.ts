const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const PLAIN_IDENTIFIER = /^[A-Za-z0-9_]+$/

export interface DemoDatabase {
	url: string
	name: string
}

/**
 * The demo commands create, fill and (on request) drop a database. They only ever act on a
 * database that is visibly a demo one, on this machine: a wrong variable can then never reach
 * development, test, benchmark or shared data.
 */
export function assertDemoDatabaseUrl(value: string | undefined): DemoDatabase {
	if (!value) {
		throw new Error('DEMO_DATABASE_URL is not set (see .env.example)')
	}

	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		throw new Error('DEMO_DATABASE_URL is not a valid URL')
	}

	if (!LOCAL_HOSTS.has(parsed.hostname)) {
		throw new Error(`Refusing host "${parsed.hostname}": the demo database must be local`)
	}

	const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''))

	if (!PLAIN_IDENTIFIER.test(name)) {
		throw new Error(`Refusing database "${name}": the name must be a plain identifier`)
	}
	if (!name.includes('demo')) {
		throw new Error(`Refusing database "${name}": its name must contain "demo"`)
	}

	return { url: value, name }
}
