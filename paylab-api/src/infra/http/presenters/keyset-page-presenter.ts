import { KeysetPage } from '@/domain/paylab/application/services/keyset-page'
import { encodeCursor } from '../pagination/cursor'

export interface PageView<V> {
	items: V[]
	/** Pass as `?cursor=` to get the following page; null on the last page. */
	nextCursor: string | null
}

export class KeysetPagePresenter {
	static toHTTP<T extends { id: string; createdAt: Date }, V>(
		page: KeysetPage<T>,
		present: (item: T) => V,
	): PageView<V> {
		return {
			items: page.items.map(present),
			nextCursor: page.next ? encodeCursor(page.next) : null,
		}
	}
}
