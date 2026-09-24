import 'dotenv/config'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { checkPrerequisites, loadBenchDatabase } from '../bench/lib/preflight'
import {
	CliUsageError,
	EXECUTOR_VERSION,
	assertArtifactRootIgnored,
	collectSecrets,
	exitCodeFor,
	formatReport,
	parseCliArgs,
} from './benchmark/cli'
import { runBenchmark } from './benchmark/executor'
import { buildSuite } from './benchmark/suite'

async function main() {
	const { note } = parseCliArgs(process.argv.slice(2))

	// Nothing is opened, changed or published until the machine is known to be set up.
	const database = loadBenchDatabase(process.env)
	await checkPrerequisites(database)
	const suite = buildSuite(database)

	const repoDir = execFileSync('git', ['rev-parse', '--show-toplevel'], {
		encoding: 'utf8',
	}).trim()
	const artifactRoot = resolve(process.env.BENCH_ARTIFACT_ROOT ?? '.benchmark')
	const summaryDir = resolve(process.env.BENCH_SUMMARY_DIR ?? 'bench/results')
	assertArtifactRootIgnored(repoDir, artifactRoot)

	// Ctrl+C or SIGTERM stops the running scenario and still publishes an INCOMPLETE Run.
	const controller = new AbortController()
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.once(signal, () => controller.abort())
	}

	const result = await runBenchmark({
		repoDir,
		artifactRoot,
		summaryDir,
		suite,
		note,
		executorVersion: EXECUTOR_VERSION,
		secrets: collectSecrets(process.env),
		signal: controller.signal,
		onProgress: (progress) => console.log(`[${progress.runId}] ${progress.message}`),
	})

	console.log(`\n${formatReport(result)}`)
	process.exitCode = exitCodeFor(result)
}

main().catch((error) => {
	console.error(error instanceof CliUsageError ? error.message : `${error.message ?? error}`)
	process.exitCode = 2
})
