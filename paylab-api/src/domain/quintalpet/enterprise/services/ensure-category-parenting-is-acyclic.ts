import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { CategoryCycleError } from '../errors/category-cycle-error'

interface EnsureCategoryParentingIsAcyclicRequest {
	categoryId: UniqueEntityID
	parentCategoryId: UniqueEntityID | null
	ancestorCategoryIds: UniqueEntityID[]
}

export function ensureCategoryParentingIsAcyclic({
	categoryId,
	parentCategoryId,
	ancestorCategoryIds,
}: EnsureCategoryParentingIsAcyclicRequest) {
	if (!parentCategoryId) {
		return
	}

	if (parentCategoryId.equals(categoryId)) {
		throw new CategoryCycleError()
	}

	if (ancestorCategoryIds.some((ancestorCategoryId) => ancestorCategoryId.equals(categoryId))) {
		throw new CategoryCycleError()
	}
}
