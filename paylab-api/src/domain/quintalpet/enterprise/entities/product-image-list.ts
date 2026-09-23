import { WatchedList } from '@/core/entities/watched-list'
import { ProductImage } from './product-image'

export class ProductImageList extends WatchedList<ProductImage> {
	compareItems(a: ProductImage, b: ProductImage): boolean {
		return a.id.equals(b.id)
	}
}
