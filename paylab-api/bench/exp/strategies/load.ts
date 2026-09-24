// EXPERIMENT ONLY (T14). CLI around `runLoadBlock`: prints one JSON line per strategy.
// Usage: ts-node -r tsconfig-paths/register bench/exp/strategies/load.ts \
//   --shape H|W|M --clients 16 --strategies nokey,serializable --rep 1 [--duration 12] [--warmup 2] [--sync on|off]
import { runLoadBlock } from './load-run'
import type { Strategy } from './strategies'

const args = new Map<string, string>()
for (let i = 2; i < process.argv.length; i += 2)
	args.set(process.argv[i].replace(/^--/, ''), process.argv[i + 1])

runLoadBlock({
	shape: args.get('shape') as 'H' | 'W' | 'M',
	clients: Number(args.get('clients') ?? 16),
	strategies: (args.get('strategies') ?? 'nokey').split(',') as Strategy[],
	durationS: Number(args.get('duration') ?? 12),
	warmupS: Number(args.get('warmup') ?? 2),
	sync: (args.get('sync') ?? 'on') as 'on' | 'off',
	rep: Number(args.get('rep') ?? 1),
	onLine: (line) => console.log(JSON.stringify(line)),
}).catch((e) => {
	console.error(e)
	process.exit(2)
})
