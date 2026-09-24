const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])
const PLAIN_IDENTIFIER = /^[A-Za-z0-9_]+$/

export interface BenchDatabase {
	url: string
	name: string
	/** Pristine copy the database is restored from before every Run. */
	templateName: string
}

function serverAndDatabase(value: string) {
	try {
		const parsed = new URL(value)
		return `${parsed.hostname}:${parsed.port || '5432'}/${decodeURIComponent(parsed.pathname.replace(/^\//, ''))}`
	} catch {
		return null
	}
}

/**
 * A benchmark Run drops and recreates this database. It only ever acts on one that is visibly a
 * benchmark database, on this machine, and never on the development or test database.
 */
export function assertBenchDatabaseUrl(
	value: string | undefined,
	options: { templateName?: string; forbiddenUrls?: (string | undefined)[] } = {},
): BenchDatabase {
	if (!value) {
		throw new Error('BENCH_DATABASE_URL is not set (see .env.example)')
	}

	let parsed: URL
	try {
		parsed = new URL(value)
	} catch {
		throw new Error('BENCH_DATABASE_URL is not a valid URL')
	}

	if (!LOCAL_HOSTS.has(parsed.hostname)) {
		throw new Error(`Refusing host "${parsed.hostname}": the benchmark database must be local`)
	}

	const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''))
	if (!PLAIN_IDENTIFIER.test(name)) {
		throw new Error(`Refusing database "${name}": the name must be a plain identifier`)
	}
	if (!name.includes('bench')) {
		throw new Error(`Refusing database "${name}": its name must contain "bench"`)
	}

	const target = serverAndDatabase(value)
	for (const forbidden of options.forbiddenUrls ?? []) {
		if (forbidden && serverAndDatabase(forbidden) === target) {
			throw new Error(`Refusing database "${name}": it is the development or test database`)
		}
	}

	const templateName = options.templateName ?? `${name}_template`
	if (!PLAIN_IDENTIFIER.test(templateName) || templateName === name) {
		throw new Error(
			`Refusing template "${templateName}": it must be a plain identifier different from the database`,
		)
	}

	return { url: value, name, templateName }
}
