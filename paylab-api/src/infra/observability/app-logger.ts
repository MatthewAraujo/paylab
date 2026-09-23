import { inspect } from 'node:util'
import { AppRequestContext } from '@/infra/observability/request-context'
import { LoggerService } from '@nestjs/common'

export type AppLogLevel = 'basic' | 'debug'

export interface AppLoggerConfig {
	enabled: boolean
	level: AppLogLevel
	appName: string
	environment: string
	colors?: boolean
}

export interface AppLoggerSinks {
	info: (line: string) => void
	warn: (line: string) => void
	error: (line: string) => void
}

const defaultSinks: AppLoggerSinks = {
	info: (line) => console.log(line),
	warn: (line) => console.warn(line),
	error: (line) => console.error(line),
}

type LogLevelName = 'info' | 'warn' | 'error' | 'debug'
type LogMetadata = Record<string, unknown> & {
	context?: string
}

const redactedPattern =
	/password|passphrase|pwd|secret|token|key|signature|authorization|bearer|encrypted|cookie|credential|session/i
const ansi = {
	reset: '\u001B[0m',
	green: '\u001B[32m',
	yellow: '\u001B[33m',
	red: '\u001B[31m',
	cyan: '\u001B[36m',
	magenta: '\u001B[35m',
}

function compactRecord(record: Record<string, unknown>) {
	return Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined))
}

function formatLevel(level: LogLevelName) {
	switch (level) {
		case 'info':
			return 'LOG'
		case 'warn':
			return 'WARN'
		case 'error':
			return 'ERROR'
		case 'debug':
			return 'DEBUG'
	}
}

function colorize(enabled: boolean, color: string, text: string) {
	if (!enabled) {
		return text
	}

	return `${color}${text}${ansi.reset}`
}

function sanitizeForLogging(value: unknown): unknown {
	if (Array.isArray(value)) {
		return value.map((item) => sanitizeForLogging(item))
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, innerValue]) => [
				key,
				redactedPattern.test(key) ? '[REDACTED]' : sanitizeForLogging(innerValue),
			]),
		)
	}

	return value
}

export class AppLogger implements LoggerService {
	constructor(
		private readonly config: AppLoggerConfig,
		private readonly contextProvider: () => AppRequestContext | undefined = () => undefined,
		private readonly sinks: AppLoggerSinks = defaultSinks,
	) {}

	isEnabled() {
		return this.config.enabled
	}

	isDebugEnabled() {
		return this.config.enabled && this.config.level === 'debug'
	}

	sanitize(value: unknown) {
		return sanitizeForLogging(value)
	}

	info(event: string, metadata: LogMetadata = {}) {
		this.write('info', event, metadata)
	}

	warnEvent(event: string, metadata: LogMetadata = {}) {
		this.write('warn', event, metadata)
	}

	errorEvent(event: string, metadata: LogMetadata = {}) {
		this.write('error', event, metadata)
	}

	debugEvent(event: string, metadata: LogMetadata = {}) {
		this.write('debug', event, metadata)
	}

	log(message: unknown, context?: string) {
		this.write('info', this.stringifyMessage(message), { context })
	}

	error(message: unknown, trace?: string, context?: string) {
		this.write('error', this.stringifyMessage(message), { context, trace })
	}

	warn(message: unknown, context?: string) {
		this.write('warn', this.stringifyMessage(message), { context })
	}

	debug(message: unknown, context?: string) {
		this.write('debug', this.stringifyMessage(message), { context })
	}

	verbose(message: unknown, context?: string) {
		this.write('debug', this.stringifyMessage(message), { context })
	}

	private write(level: LogLevelName, message: string, metadata: LogMetadata) {
		if (!this.config.enabled) {
			return
		}

		if (level === 'debug' && this.config.level !== 'debug') {
			return
		}

		const requestContext = this.contextProvider()
		const contextName = metadata.context ?? this.config.appName
		const colorsEnabled = this.config.colors ?? true
		const mergedMetadata = compactRecord({
			environment: this.config.environment,
			requestId: requestContext?.requestId,
			method: requestContext?.method,
			route: requestContext?.route,
			path: requestContext?.path,
			storeId: requestContext?.storeId,
			userId: requestContext?.userId,
			...metadata,
		})
		mergedMetadata.context = undefined

		const formattedMetadata =
			Object.keys(mergedMetadata).length > 0
				? ` ${inspect(this.sanitize(mergedMetadata), {
						depth: 8,
						colors: colorsEnabled,
						compact: true,
						breakLength: Number.POSITIVE_INFINITY,
					})}`
				: ''

		const levelLabel = colorize(
			colorsEnabled,
			level === 'error'
				? ansi.red
				: level === 'warn'
					? ansi.yellow
					: level === 'debug'
						? ansi.cyan
						: ansi.green,
			formatLevel(level).padEnd(5),
		)
		const contextLabel = colorize(
			colorsEnabled,
			/UseCase$/.test(contextName) ? ansi.yellow : ansi.magenta,
			`[${contextName}]`,
		)

		const line =
			`[Nest] ${process.pid}  - ${new Date().toLocaleString('en-US')}   ` +
			`${levelLabel} ${contextLabel} ${message}${formattedMetadata}`

		switch (level) {
			case 'error':
				this.sinks.error(line)
				return
			case 'warn':
				this.sinks.warn(line)
				return
			default:
				this.sinks.info(line)
		}
	}

	private stringifyMessage(message: unknown) {
		if (typeof message === 'string') {
			return message
		}

		if (message instanceof Error) {
			return message.message
		}

		return inspect(this.sanitize(message), {
			depth: 8,
			colors: this.config.colors ?? true,
			compact: true,
			breakLength: Number.POSITIVE_INFINITY,
		})
	}
}
