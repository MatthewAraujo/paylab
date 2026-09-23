export interface BoundedContextDescriptor {
	name: 'identity' | 'catalog' | 'inventory' | 'merchandising'
	routePrefix: string
	status: 'foundation' | 'planned'
}
