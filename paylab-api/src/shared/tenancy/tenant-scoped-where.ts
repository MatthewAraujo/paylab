export function withOrganizationScope<T extends object>(
	storeId: string,
	where: T = {} as T,
): T & { storeId: string } {
	return {
		...where,
		storeId,
	}
}
