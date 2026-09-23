import { NotAllowedError } from '@/core/errors/errors/not-allowed-error'
import { ResourceNotFoundError } from '@/core/errors/errors/resource-not-found-error'
import { BarcodeNotInDraftError } from '@/domain/quintalpet/application/use-cases/errors/barcode-not-in-draft-error'
import { EmptySaleDraftError } from '@/domain/quintalpet/application/use-cases/errors/empty-sale-draft-error'
import { FavoriteProductNotAvailableError } from '@/domain/quintalpet/application/use-cases/errors/favorite-product-not-available-error'
import { InvalidAttachmentTypeError } from '@/domain/quintalpet/application/use-cases/errors/invalid-attachment-type-error'
import { InvalidHomeOfferSelectionError } from '@/domain/quintalpet/application/use-cases/errors/invalid-home-offer-selection-error'
import { OrderItemUnavailableError } from '@/domain/quintalpet/application/use-cases/errors/order-item-unavailable-error'
import { OrderPlacementConflictError } from '@/domain/quintalpet/application/use-cases/errors/order-placement-conflict-error'
import { SaleDraftAlreadyActiveError } from '@/domain/quintalpet/application/use-cases/errors/sale-draft-already-active-error'
import { StoreCustomerConflictError } from '@/domain/quintalpet/application/use-cases/errors/store-customer-conflict-error'
import { VariantBarcodeAlreadySetError } from '@/domain/quintalpet/application/use-cases/errors/variant-barcode-already-set-error'
import { VariantNotFoundError } from '@/domain/quintalpet/application/use-cases/errors/variant-not-found-error'
import {
	CatalogConflictError,
	CatalogValidationError,
} from '@/domain/quintalpet/application/use-cases/manage-catalog'
import { ArchivedCatalogEntityError } from '@/domain/quintalpet/enterprise/errors/archived-catalog-entity-error'
import { CategoryCycleError } from '@/domain/quintalpet/enterprise/errors/category-cycle-error'
import { DuplicateMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/duplicate-merchandising-reference-error'
import { InactiveCategoryAssignmentError } from '@/domain/quintalpet/enterprise/errors/inactive-category-assignment-error'
import { InvalidCatalogLifecycleTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-catalog-lifecycle-transition-error'
import { InvalidDeliveryOptionError } from '@/domain/quintalpet/enterprise/errors/invalid-delivery-option-error'
import { InvalidInventoryQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-inventory-quantity-error'
import { InvalidMerchandisingReferenceError } from '@/domain/quintalpet/enterprise/errors/invalid-merchandising-reference-error'
import { InvalidOrderCustomerIdentityError } from '@/domain/quintalpet/enterprise/errors/invalid-order-customer-identity-error'
import { InvalidOrderTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-order-transition-error'
import { InvalidPostalCodeError } from '@/domain/quintalpet/enterprise/errors/invalid-postal-code-error'
import { InvalidPrimaryCategoryError } from '@/domain/quintalpet/enterprise/errors/invalid-primary-category-error'
import { InvalidPromotionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-error'
import { InvalidPromotionPayloadError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-payload-error'
import { InvalidPromotionTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-promotion-transition-error'
import { InvalidSaleDraftQuantityError } from '@/domain/quintalpet/enterprise/errors/invalid-sale-draft-quantity-error'
import { InvalidShippingSettingsError } from '@/domain/quintalpet/enterprise/errors/invalid-shipping-settings-error'
import { InvalidStoreCustomerTransitionError } from '@/domain/quintalpet/enterprise/errors/invalid-store-customer-transition-error'
import { InvalidVariantPricingError } from '@/domain/quintalpet/enterprise/errors/invalid-variant-pricing-error'
import { MerchandisingLimitExceededError } from '@/domain/quintalpet/enterprise/errors/merchandising-limit-exceeded-error'
import { NegativeInventoryBalanceError } from '@/domain/quintalpet/enterprise/errors/negative-inventory-balance-error'
import { PdvSessionAlreadyOpenError } from '@/domain/quintalpet/enterprise/errors/pdv-session-already-open-error'
import { SaleDraftItemNotFoundError } from '@/domain/quintalpet/enterprise/errors/sale-draft-item-not-found-error'
import { SaleDraftNotEmptyError } from '@/domain/quintalpet/enterprise/errors/sale-draft-not-empty-error'
import { StalePdvSessionRequiresConfirmationError } from '@/domain/quintalpet/enterprise/errors/stale-pdv-session-requires-confirmation-error'
import { StoreCustomerAddressNotFoundError } from '@/domain/quintalpet/enterprise/errors/store-customer-address-not-found-error'

export interface TranslatedDomainError {
	code: string
	message: string
}

type ErrorTranslator = (error: Error) => TranslatedDomainError

/**
 * Central domain-error -> friendly-HTTP-body translation table.
 *
 * Keep this a flat Map, not a chain of `if (error instanceof X)`, so adding the next
 * mapped error is a one-line addition.
 */
const domainErrorTranslators = new Map<Function, ErrorTranslator>([
	[
		NegativeInventoryBalanceError,
		() => ({
			code: 'INVENTORY_BALANCE_NEGATIVE',
			message: 'Não há estoque suficiente para atender esta movimentação.',
		}),
	],
	[
		MerchandisingLimitExceededError,
		(error) => {
			const typed = error as MerchandisingLimitExceededError
			const noun = typed.entityType === 'category' ? 'categorias' : 'produtos'

			return {
				code: 'MERCHANDISING_LIMIT_EXCEEDED',
				message: `Você já atingiu o limite de ${typed.limit} ${noun} em destaque.`,
			}
		},
	],
	[
		NotAllowedError,
		() => ({
			code: 'NOT_ALLOWED',
			message: 'Você não tem permissão para realizar esta ação.',
		}),
	],
	[
		ResourceNotFoundError,
		() => ({
			code: 'RESOURCE_NOT_FOUND',
			message: 'O recurso solicitado não foi encontrado.',
		}),
	],
	[
		BarcodeNotInDraftError,
		() => ({
			code: 'BARCODE_NOT_IN_DRAFT',
			message: 'Este código de barras não corresponde a nenhum item pendente nesta venda.',
		}),
	],
	[
		EmptySaleDraftError,
		() => ({
			code: 'EMPTY_SALE_DRAFT',
			message: 'Não é possível finalizar uma venda sem itens.',
		}),
	],
	[
		FavoriteProductNotAvailableError,
		(error) => {
			const typed = error as FavoriteProductNotAvailableError

			return {
				code: 'FAVORITE_PRODUCT_NOT_AVAILABLE',
				message: `O produto "${typed.productSlug}" não está disponível para favoritar nesta loja.`,
			}
		},
	],
	[
		InvalidAttachmentTypeError,
		() => ({
			code: 'INVALID_ATTACHMENT_TYPE',
			message: 'O tipo de arquivo enviado não é suportado.',
		}),
	],
	[
		OrderItemUnavailableError,
		() => ({
			code: 'ORDER_ITEM_UNAVAILABLE',
			message: 'Não há quantidade suficiente em estoque para um dos itens do pedido.',
		}),
	],
	[
		OrderPlacementConflictError,
		() => ({
			code: 'ORDER_PLACEMENT_CONFLICT',
			message: 'Não foi possível confirmar o estoque para este pedido. Tente novamente.',
		}),
	],
	[
		SaleDraftAlreadyActiveError,
		() => ({
			code: 'SALE_DRAFT_ALREADY_ACTIVE',
			message: 'Esta sessão de PDV já possui uma venda em andamento.',
		}),
	],
	[
		StoreCustomerConflictError,
		() => ({
			code: 'STORE_CUSTOMER_CONFLICT',
			message: 'Já existe um cliente cadastrado para esta loja com esses dados.',
		}),
	],
	[
		VariantBarcodeAlreadySetError,
		() => ({
			code: 'VARIANT_BARCODE_ALREADY_SET',
			message: 'Este código de barras já está vinculado a outro produto.',
		}),
	],
	[
		VariantNotFoundError,
		() => ({
			code: 'VARIANT_NOT_FOUND',
			message: 'Produto ou variante não encontrado ou não está mais ativo.',
		}),
	],
	[
		ArchivedCatalogEntityError,
		() => ({
			code: 'ARCHIVED_CATALOG_ENTITY',
			message: 'Itens arquivados do catálogo não podem ser editados.',
		}),
	],
	[
		CategoryCycleError,
		() => ({
			code: 'CATEGORY_CYCLE',
			message: 'Não é possível criar um ciclo entre categorias.',
		}),
	],
	[
		DuplicateMerchandisingReferenceError,
		() => ({
			// entityType isn't exposed as a public property on this error (unlike
			// MerchandisingLimitExceededError), so the message stays generic across
			// both 'category' and 'product' instances rather than parsing it back
			// out of the English error.message.
			code: 'DUPLICATE_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque não podem se repetir.',
		}),
	],
	[
		InactiveCategoryAssignmentError,
		() => ({
			code: 'INACTIVE_CATEGORY_ASSIGNMENT',
			message: 'Categorias inativas ou arquivadas não podem ser atribuídas a produtos.',
		}),
	],
	[
		InvalidCatalogLifecycleTransitionError,
		() => ({
			code: 'INVALID_CATALOG_LIFECYCLE_TRANSITION',
			message: 'Transição de status do catálogo inválida.',
		}),
	],
	[
		InvalidDeliveryOptionError,
		() => ({
			code: 'INVALID_DELIVERY_OPTION',
			message: 'Opção de entrega desconhecida.',
		}),
	],
	[
		InvalidPostalCodeError,
		() => ({
			code: 'INVALID_POSTAL_CODE',
			message: 'CEP inválido ou não encontrado.',
		}),
	],
	[
		InvalidShippingSettingsError,
		() => ({
			code: 'INVALID_SHIPPING_SETTINGS',
			message: 'As configurações de frete informadas são inválidas.',
		}),
	],
	[
		InvalidInventoryQuantityError,
		() => ({
			code: 'INVALID_INVENTORY_QUANTITY',
			message: 'Movimentações de estoque exigem uma quantidade positiva e diferente de zero.',
		}),
	],
	[
		InvalidMerchandisingReferenceError,
		() => ({
			// Same rationale as DuplicateMerchandisingReferenceError above:
			// entityType is not a public property on this error instance.
			code: 'INVALID_MERCHANDISING_REFERENCE',
			message: 'As referências de itens em destaque devem pertencer à loja atual.',
		}),
	],
	[
		InvalidOrderCustomerIdentityError,
		() => ({
			code: 'INVALID_ORDER_CUSTOMER_IDENTITY',
			message:
				'Um pedido deve ter um cliente cadastrado ou um nome e telefone de convidado, mas não ambos.',
		}),
	],
	[
		InvalidOrderTransitionError,
		() => ({
			code: 'INVALID_ORDER_TRANSITION',
			message: 'Transição de status do pedido inválida.',
		}),
	],
	[
		InvalidPrimaryCategoryError,
		() => ({
			code: 'INVALID_PRIMARY_CATEGORY',
			message: 'A categoria principal deve estar entre as categorias atribuídas.',
		}),
	],
	[
		InvalidSaleDraftQuantityError,
		() => ({
			code: 'INVALID_SALE_DRAFT_QUANTITY',
			message: 'Não é possível reduzir um item da venda para uma quantidade abaixo de zero.',
		}),
	],
	[
		InvalidStoreCustomerTransitionError,
		() => ({
			code: 'INVALID_STORE_CUSTOMER_TRANSITION',
			message: 'Transição de status do cliente inválida.',
		}),
	],
	[
		InvalidVariantPricingError,
		() => ({
			code: 'INVALID_VARIANT_PRICING',
			message: 'O preço da variante é inválido.',
		}),
	],
	[
		PdvSessionAlreadyOpenError,
		() => ({
			code: 'PDV_SESSION_ALREADY_OPEN',
			message: 'Já existe uma sessão de PDV aberta para esta loja hoje.',
		}),
	],
	[
		SaleDraftItemNotFoundError,
		() => ({
			code: 'SALE_DRAFT_ITEM_NOT_FOUND',
			message: 'Não há nenhum item correspondente para este produto nesta venda.',
		}),
	],
	[
		SaleDraftNotEmptyError,
		() => ({
			code: 'SALE_DRAFT_NOT_EMPTY',
			message: 'Não é possível fechar uma sessão de PDV enquanto a venda ativa ainda tiver itens.',
		}),
	],
	[
		StalePdvSessionRequiresConfirmationError,
		() => ({
			code: 'PDV_STALE_SESSION',
			message:
				'Existe uma sessão de PDV aberta de um dia anterior. Confirme a substituição para abrir uma nova sessão.',
		}),
	],
	[
		StoreCustomerAddressNotFoundError,
		() => ({
			code: 'STORE_CUSTOMER_ADDRESS_NOT_FOUND',
			message: 'Endereço do cliente não encontrado.',
		}),
	],
	[
		CatalogConflictError,
		() => ({
			code: 'CATALOG_CONFLICT',
			message:
				'Já existe um registro de catálogo com esses dados. Verifique as informações e tente novamente.',
		}),
	],
	[
		CatalogValidationError,
		() => ({
			code: 'CATALOG_VALIDATION_ERROR',
			message:
				'Os dados informados para o catálogo são inválidos. Verifique as informações e tente novamente.',
		}),
	],
	[
		InvalidPromotionError,
		() => ({
			code: 'INVALID_PROMOTION',
			message: 'Os dados informados para a promoção são inválidos. Verifique e tente novamente.',
		}),
	],
	[
		InvalidPromotionPayloadError,
		() => ({
			code: 'INVALID_PROMOTION_PAYLOAD',
			message: 'As condições ou benefícios informados para a promoção são inválidos.',
		}),
	],
	[
		InvalidPromotionTransitionError,
		() => ({
			code: 'INVALID_PROMOTION_TRANSITION',
			message: 'Transição de status da promoção inválida.',
		}),
	],
	[
		InvalidHomeOfferSelectionError,
		() => ({
			code: 'INVALID_HOME_OFFER_SELECTION',
			message:
				'As ofertas da home devem referenciar promoções públicas desta loja elegíveis para exibição na vitrine.',
		}),
	],
])

/**
 * Looks up a friendly, PT-BR `{ code, message }` translation for a known domain
 * error. Returns null for anything not mapped so callers fall back to their existing
 * behavior (today's raw `error.message`) — unmapped domain errors are deliberately
 * unaffected by this table.
 */
export function translateDomainError(error: unknown): TranslatedDomainError | null {
	if (!(error instanceof Error)) {
		return null
	}

	const translator = domainErrorTranslators.get(error.constructor as Function)

	return translator ? translator(error) : null
}
