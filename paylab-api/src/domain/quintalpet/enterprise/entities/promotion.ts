import { AggregateRoot } from '@/core/entities/aggregate-root'
import { UniqueEntityID } from '@/core/entities/unique-entity-id'
import { Optional } from '@/core/types/optional'
import { InvalidPromotionError } from '../errors/invalid-promotion-error'
import { InvalidPromotionTransitionError } from '../errors/invalid-promotion-transition-error'
import { PromotionChannel } from '../types/promotion-channel'
import { PromotionStatus } from '../types/promotion-status'
import { PromotionTargetScope } from '../types/promotion-target-scope'
import { PromotionVisibility } from '../types/promotion-visibility'
import { PromotionBenefit, parsePromotionBenefits } from '../value-objects/promotion-benefits'
import {
	PromotionCondition,
	PromotionConditionType,
	parsePromotionConditions,
} from '../value-objects/promotion-conditions'
import {
	PromotionPublicHighlight,
	parsePromotionPublicHighlight,
} from '../value-objects/promotion-public-highlight'

export interface PromotionProps {
	storeId: UniqueEntityID
	name: string
	status: PromotionStatus
	visibility: PromotionVisibility
	channels: PromotionChannel[]
	priority: number
	isStackable: boolean
	targetScope: PromotionTargetScope
	/** `null` on both bounds means always-on. */
	startsAt: Date | null
	endsAt: Date | null
	conditions: PromotionCondition[]
	benefits: PromotionBenefit[]
	publicHighlight: PromotionPublicHighlight | null
	createdAt: Date
	updatedAt: Date | null
}

export interface PromotionMutableInput {
	name?: string
	visibility?: PromotionVisibility
	channels?: PromotionChannel[]
	priority?: number
	isStackable?: boolean
	targetScope?: PromotionTargetScope
	startsAt?: Date | null
	endsAt?: Date | null
	conditions?: unknown
	benefits?: unknown
	publicHighlight?: unknown
}

const ALLOWED_TRANSITIONS: Record<PromotionStatus, PromotionStatus[]> = {
	[PromotionStatus.DRAFT]: [
		PromotionStatus.ACTIVE,
		PromotionStatus.INACTIVE,
		PromotionStatus.ARCHIVED,
	],
	[PromotionStatus.ACTIVE]: [PromotionStatus.INACTIVE, PromotionStatus.ARCHIVED],
	[PromotionStatus.INACTIVE]: [PromotionStatus.ACTIVE, PromotionStatus.ARCHIVED],
	[PromotionStatus.ARCHIVED]: [],
}

export class Promotion extends AggregateRoot<PromotionProps> {
	get storeId() {
		return this.props.storeId
	}
	get name() {
		return this.props.name
	}
	get status() {
		return this.props.status
	}
	get visibility() {
		return this.props.visibility
	}
	get channels() {
		return this.props.channels
	}
	get priority() {
		return this.props.priority
	}
	get isStackable() {
		return this.props.isStackable
	}
	get targetScope() {
		return this.props.targetScope
	}
	get startsAt() {
		return this.props.startsAt
	}
	get endsAt() {
		return this.props.endsAt
	}
	get conditions() {
		return this.props.conditions
	}
	get benefits() {
		return this.props.benefits
	}
	get publicHighlight() {
		return this.props.publicHighlight
	}
	get createdAt() {
		return this.props.createdAt
	}
	get updatedAt() {
		return this.props.updatedAt ?? null
	}

	/** True when `at` falls inside the validity window (both bounds null = always-on). */
	isWithinValidityWindow(at: Date = new Date()): boolean {
		if (this.props.startsAt && at.getTime() < this.props.startsAt.getTime()) {
			return false
		}
		if (this.props.endsAt && at.getTime() > this.props.endsAt.getTime()) {
			return false
		}
		return true
	}

	isActiveAt(at: Date = new Date()): boolean {
		return this.props.status === PromotionStatus.ACTIVE && this.isWithinValidityWindow(at)
	}

	allowsChannel(channel: PromotionChannel): boolean {
		return this.props.channels.includes(channel)
	}

	isPublic(): boolean {
		return this.props.visibility === PromotionVisibility.PUBLIC
	}

	isCouponOnly(): boolean {
		return this.props.conditions.some(
			(condition) => condition.type === PromotionConditionType.COUPON,
		)
	}

	couponCode(): string | null {
		for (const condition of this.props.conditions) {
			if (condition.type === PromotionConditionType.COUPON) {
				return condition.code
			}
		}
		return null
	}

	/**
	 * Store-scoped storefront discovery rule: active, public, and not gated by a
	 * private coupon code.
	 */
	isEligibleForPublicDiscovery(at: Date = new Date()): boolean {
		return this.isActiveAt(at) && this.isPublic() && !this.isCouponOnly()
	}

	categoryConditionIds(): { categoryId: string; includeDescendants: boolean }[] {
		return this.props.conditions
			.filter(
				(
					condition,
				): condition is Extract<PromotionCondition, { type: PromotionConditionType.CATEGORY }> =>
					condition.type === PromotionConditionType.CATEGORY,
			)
			.map((condition) => ({
				categoryId: condition.categoryId,
				includeDescendants: condition.includeDescendants,
			}))
	}

	update(input: PromotionMutableInput) {
		if (this.props.status === PromotionStatus.ARCHIVED) {
			throw new InvalidPromotionError('an archived promotion cannot be edited')
		}

		const next: PromotionProps = { ...this.props }

		if (input.name !== undefined) next.name = input.name
		if (input.visibility !== undefined) next.visibility = input.visibility
		if (input.channels !== undefined) next.channels = input.channels
		if (input.priority !== undefined) next.priority = input.priority
		if (input.isStackable !== undefined) next.isStackable = input.isStackable
		if (input.targetScope !== undefined) next.targetScope = input.targetScope
		if (input.startsAt !== undefined) next.startsAt = input.startsAt
		if (input.endsAt !== undefined) next.endsAt = input.endsAt
		if (input.conditions !== undefined) next.conditions = parsePromotionConditions(input.conditions)
		if (input.benefits !== undefined) next.benefits = parsePromotionBenefits(input.benefits)
		if (input.publicHighlight !== undefined) {
			next.publicHighlight = parsePromotionPublicHighlight(input.publicHighlight)
		}

		Promotion.assertInvariants(next)

		this.props.name = next.name
		this.props.visibility = next.visibility
		this.props.channels = next.channels
		this.props.priority = next.priority
		this.props.isStackable = next.isStackable
		this.props.targetScope = next.targetScope
		this.props.startsAt = next.startsAt
		this.props.endsAt = next.endsAt
		this.props.conditions = next.conditions
		this.props.benefits = next.benefits
		this.props.publicHighlight = next.publicHighlight
		this.touch()
	}

	changeStatus(next: PromotionStatus) {
		if (next === this.props.status) {
			return
		}
		if (!ALLOWED_TRANSITIONS[this.props.status].includes(next)) {
			throw new InvalidPromotionTransitionError(this.props.status, next)
		}
		this.props.status = next
		this.touch()
	}

	activate() {
		this.changeStatus(PromotionStatus.ACTIVE)
	}
	deactivate() {
		this.changeStatus(PromotionStatus.INACTIVE)
	}
	archive() {
		this.changeStatus(PromotionStatus.ARCHIVED)
	}

	private touch() {
		this.props.updatedAt = new Date()
	}

	private static assertInvariants(props: PromotionProps) {
		if (!props.name || props.name.trim().length === 0) {
			throw new InvalidPromotionError('name is required')
		}
		if (!Number.isInteger(props.priority)) {
			throw new InvalidPromotionError('priority must be an integer')
		}
		if (props.channels.length === 0) {
			throw new InvalidPromotionError('at least one channel is required')
		}
		if (new Set(props.channels).size !== props.channels.length) {
			throw new InvalidPromotionError('channels must not repeat')
		}
		for (const channel of props.channels) {
			if (!Object.values(PromotionChannel).includes(channel)) {
				throw new InvalidPromotionError(`unknown channel "${String(channel)}"`)
			}
		}
		if (!Object.values(PromotionTargetScope).includes(props.targetScope)) {
			throw new InvalidPromotionError('a valid target scope is required')
		}
		if (props.startsAt && props.endsAt && props.startsAt.getTime() > props.endsAt.getTime()) {
			throw new InvalidPromotionError('startsAt must not be after endsAt')
		}
	}

	static create(
		props: Optional<
			Omit<PromotionProps, 'conditions' | 'benefits' | 'publicHighlight'> & {
				conditions?: unknown
				benefits?: unknown
				publicHighlight?: unknown
			},
			| 'status'
			| 'visibility'
			| 'channels'
			| 'priority'
			| 'isStackable'
			| 'startsAt'
			| 'endsAt'
			| 'conditions'
			| 'benefits'
			| 'publicHighlight'
			| 'createdAt'
			| 'updatedAt'
		>,
		id?: UniqueEntityID,
	): Promotion {
		const resolved: PromotionProps = {
			storeId: props.storeId,
			name: props.name,
			status: props.status ?? PromotionStatus.DRAFT,
			visibility: props.visibility ?? PromotionVisibility.PRIVATE,
			channels: props.channels ?? [],
			priority: props.priority ?? 0,
			isStackable: props.isStackable ?? false,
			targetScope: props.targetScope,
			startsAt: props.startsAt ?? null,
			endsAt: props.endsAt ?? null,
			conditions: parsePromotionConditions(props.conditions),
			benefits: parsePromotionBenefits(props.benefits),
			publicHighlight: parsePromotionPublicHighlight(props.publicHighlight),
			createdAt: props.createdAt ?? new Date(),
			updatedAt: props.updatedAt ?? null,
		}

		Promotion.assertInvariants(resolved)

		return new Promotion(resolved, id)
	}
}
