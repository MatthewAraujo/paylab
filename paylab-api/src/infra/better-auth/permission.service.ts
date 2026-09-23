import { PrismaService } from '@/infra/database/prisma/prisma.service'
import { Injectable } from '@nestjs/common'

/**
 * Service to check user permissions and roles
 * Queries PetAgro domain entities (CustomerProfile, StoreMember)
 */
@Injectable()
export class PermissionService {
	constructor(private readonly prisma: PrismaService) {}

	/**
	 * Check if user is a customer (has CustomerProfile)
	 */
	async isCustomer(userId: string): Promise<boolean> {
		const profile = await this.prisma.customerProfile.findUnique({ where: { userId } })
		return profile !== null
	}

	/**
	 * Check if user is a store owner (has at least one StoreMember)
	 */
	async isStoreMember(userId: string): Promise<boolean> {
		const membership = await this.prisma.storeMember.findFirst({ where: { userId } })
		return membership !== null
	}

	/**
	 * Check if user is a platform admin (can manage stores/admins across the platform)
	 */
	async isPlatformAdmin(userId: string): Promise<boolean> {
		const admin = await this.prisma.platformAdmin.findUnique({ where: { userId } })
		return admin !== null
	}

	/**
	 * Get store IDs that the user can access
	 */
	async getAccessibleStores(userId: string): Promise<string[]> {
		const memberships = await this.prisma.storeMember.findMany({
			where: { userId },
			select: { storeId: true },
		})
		return memberships.map((membership) => membership.storeId)
	}

	/**
	 * Check if user has access to a specific store
	 */
	async canAccessStore(userId: string, storeId: string): Promise<boolean> {
		const stores = await this.getAccessibleStores(userId)
		return stores.includes(storeId)
	}
}
