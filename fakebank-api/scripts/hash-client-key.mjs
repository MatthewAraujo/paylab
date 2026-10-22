// Prints the SHA-256 hex of a Client API key, for a FAKEBANK_CLIENTS entry (clientId:<hash>).
// Usage: pnpm client-key:hash <key>   or   printf %s "$KEY" | pnpm client-key:hash
// Reading from stdin keeps a real key out of shell history.
import { createHash } from 'node:crypto'

async function readKey() {
	if (process.argv[2]) return process.argv[2]
	let input = ''
	for await (const chunk of process.stdin) input += chunk
	return input.replace(/\r?\n$/, '')
}

const key = await readKey()
if (!key) {
	console.error('Usage: pnpm client-key:hash <key>  (or pipe the key on stdin)')
	process.exit(1)
}
console.log(createHash('sha256').update(key).digest('hex'))
