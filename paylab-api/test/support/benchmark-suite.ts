import type { BenchmarkSuite, ScenarioSpec } from '../../scripts/benchmark/executor'

// Controlled scenario processes: each one is a real child process, like the real suite.
function spec(id: string, script: string, config: Record<string, unknown> = {}): ScenarioSpec {
	return {
		definition: {
			id,
			group: 'fake',
			title: `Fake ${id}`,
			protocol: { repetitions: 1, aggregation: 'median' },
			config,
		},
		command: process.execPath,
		args: ['-e', script],
	}
}

const metric = (value: number) =>
	JSON.stringify([
		{ key: 'tps', label: 'Throughput', unit: 'tx/s', direction: 'HIGHER_IS_BETTER', value },
	])

export function okScenario(id: string, value = 100): ScenarioSpec {
	return spec(
		id,
		`console.log('working on ${id}'); console.log('BENCH_RESULT ' + ${JSON.stringify(metric(value))})`,
	)
}

/** Succeeds after a delay, so a second invocation can be attempted while it runs. */
export function slowScenario(id: string, ms: number): ScenarioSpec {
	return spec(
		id,
		`console.log('slow start'); setTimeout(() => console.log('BENCH_RESULT ' + ${JSON.stringify(metric(1))}), ${ms})`,
	)
}

export function failingScenario(id: string, stderr: string, exitCode = 3): ScenarioSpec {
	return spec(id, `console.error(${JSON.stringify(stderr)}); process.exit(${exitCode})`)
}

/** Prints a database URL and a secret on both streams, then fails with the secret in its output. */
export function leakyScenario(id: string, secret: string): ScenarioSpec {
	const script = `console.log('url postgresql://paylab:s3cretpw@localhost:5433/paylab_bench'); console.log('key ${secret}'); console.error('failed using ${secret}'); process.exit(1)`
	return { ...spec(id, script), args: ['-e', script, secret] }
}

/** Succeeds only if `markerPath` exists when it starts, proving something ran before it. */
export function requiresFileScenario(id: string, markerPath: string): ScenarioSpec {
	return spec(
		id,
		`if (!require('fs').existsSync(${JSON.stringify(markerPath)})) { console.error('marker missing'); process.exit(4) } console.log('BENCH_RESULT ' + ${JSON.stringify(metric(1))})`,
	)
}

/** Writes extra evidence next to its log through BENCH_ARTIFACT_DIR, like the T13 plans. */
export function evidenceScenario(id: string, files: Record<string, string>): ScenarioSpec {
	return spec(
		id,
		`const fs = require('fs'), path = require('path'); const dir = process.env.BENCH_ARTIFACT_DIR; for (const [name, text] of Object.entries(${JSON.stringify(files)})) fs.writeFileSync(path.join(dir, name), text); console.log('BENCH_RESULT ' + ${JSON.stringify(metric(1))})`,
	)
}

export function silentScenario(id: string): ScenarioSpec {
	return spec(id, `console.log('finished without a result')`)
}

/** Runs until it is killed; used to interrupt a Run. */
export function hangingScenario(id: string): ScenarioSpec {
	return spec(id, `console.log('started'); setInterval(() => {}, 1000)`)
}

export function fakeSuite(scenarios: ScenarioSpec[]): BenchmarkSuite {
	return {
		prepare: async () => ({ fingerprint: 'ds-fake-1', description: 'fake dataset' }),
		scenarios,
	}
}
