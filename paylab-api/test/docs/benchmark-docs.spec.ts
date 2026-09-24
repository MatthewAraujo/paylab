import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

// The operating documentation must not drift from the code: commands exist, new scripts and
// variables get documented, and links resolve.

const root = process.cwd()
const read = (file: string) => readFileSync(join(root, file), 'utf8')
const scripts = Object.keys(JSON.parse(read('package.json')).scripts as Record<string, string>)
const DOCS = ['PROJECT.md', 'docs/benchmark.md', 'docs/DEVELOPMENT.md']
const PNPM_BUILTINS = new Set(['install', 'exec', 'dlx', 'run', 'add', 'remove'])

describe('benchmark documentation', () => {
	it.each(DOCS)('%s only mentions pnpm commands that exist', (file) => {
		const mentioned = [...read(file).matchAll(/pnpm ([a-z][a-z0-9:_-]*)/g)].map((m) => m[1])

		for (const command of mentioned) {
			expect(
				PNPM_BUILTINS.has(command) || scripts.includes(command),
				`${file}: pnpm ${command}`,
			).toBe(true)
		}
	})

	it('documents every benchmark script in the project handbook', () => {
		const handbook = read('PROJECT.md')

		for (const script of scripts.filter((name) => /^bench(mark)?[:]/.test(name))) {
			expect(handbook, script).toContain(script.replace(/^bench:/, 'bench:'))
		}
	})

	it('documents every BENCH variable of .env.example in the handbook', () => {
		const handbook = read('PROJECT.md')
		const variables = [...read('.env.example').matchAll(/^#?\s*(BENCH[A-Z_]*)=/gm)].map((m) => m[1])

		expect(variables).toEqual(
			expect.arrayContaining([
				'BENCH_DATABASE_URL',
				'BENCH_ARTIFACT_ROOT',
				'BENCH_SUMMARY_DIR',
				'BENCH_BASELINE_FILE',
				'BENCHMARK_ENABLED',
			]),
		)
		for (const variable of new Set(variables)) {
			expect(handbook, variable).toContain(variable)
		}
	})

	it.each(['PROJECT.md', 'docs/benchmark.md'])('%s has no broken relative link', (file) => {
		const links = [...read(file).matchAll(/\]\(([^)\s]+)\)/g)]
			.map((m) => m[1].split('#')[0])
			.filter((target) => target && !/^[a-z]+:/.test(target))

		for (const target of links) {
			expect(existsSync(resolve(root, dirname(file), target)), `${file} -> ${target}`).toBe(true)
		}
	})

	it('explains how the published evidence is stored and who may read it', () => {
		const guide = read('docs/benchmark.md')

		for (const expected of [
			'bench/results',
			'bench/baseline.json',
			'.benchmark',
			'benchmark:run',
			'benchmark:import',
			'bench:template',
			'BENCHMARK_ENABLED',
			'/v1/benchmarks',
		]) {
			expect(guide, expected).toContain(expected)
		}
	})
})
