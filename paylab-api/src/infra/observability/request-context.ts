import { AsyncLocalStorage } from 'node:async_hooks'
import { Injectable } from '@nestjs/common'

export interface AppRequestContext {
	requestId: string
	method?: string
	route?: string
	path?: string
	storeId?: string
	userId?: string
}

@Injectable()
export class RequestContextService {
	private readonly storage = new AsyncLocalStorage<AppRequestContext>()

	run<T>(context: AppRequestContext, callback: () => T): T {
		return this.storage.run(context, callback)
	}

	get(): AppRequestContext | undefined {
		return this.storage.getStore()
	}
}
