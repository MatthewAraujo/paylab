import { Transform, type TransformCallback } from 'node:stream'
import { StringDecoder } from 'node:string_decoder'

/** Applies a line-wise sanitizer to a byte stream, so a secret can never straddle a chunk. */
export class SanitizingLines extends Transform {
	private readonly decoder = new StringDecoder('utf8')
	private rest = ''

	constructor(private readonly sanitize: (line: string) => string) {
		super()
	}

	_transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback) {
		const lines = (this.rest + this.decoder.write(chunk)).split('\n')
		this.rest = lines.pop() ?? ''
		if (lines.length > 0) {
			this.push(`${lines.map(this.sanitize).join('\n')}\n`)
		}
		callback()
	}

	_flush(callback: TransformCallback) {
		const tail = this.rest + this.decoder.end()
		if (tail.length > 0) {
			this.push(this.sanitize(tail))
		}
		callback()
	}
}
