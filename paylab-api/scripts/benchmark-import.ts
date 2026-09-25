import 'dotenv/config'
import { resolve } from 'node:path'
import { importLegacyEvidence } from './benchmark/import/importer'

// One-time, idempotent: turns the T13 and T14 evidence under docs/experiments into Imported
// Benchmark Runs. Nothing is committed; review the generated files, then commit them.
function main() {
	const summaryDir = resolve(process.env.BENCH_SUMMARY_DIR ?? 'bench/results')
	const { written, unchanged } = importLegacyEvidence({ rootDir: process.cwd(), summaryDir })

	for (const file of unchanged) console.log(`unchanged  ${file}`)
	for (const file of written) console.log(`written    ${file}`)
	if (written.length > 0) {
		console.log(
			`\nWritten to ${summaryDir} (not committed; review, then commit).\nSuggested commit message:\n  chore(bench): import T13 and T14 evidence as benchmark runs`,
		)
	} else {
		console.log('\nNothing to do: the evidence is already imported.')
	}
}

try {
	main()
} catch (error) {
	console.error(error instanceof Error ? error.message : error)
	process.exitCode = 2
}
