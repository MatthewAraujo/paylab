import { PdvSession } from '@/domain/quintalpet/enterprise/entities/pdv-session'

export function presentPdvSession(session: PdvSession) {
	return {
		id: session.id.toString(),
		storeId: session.storeId.toString(),
		status: session.status,
		openedByUserId: session.openedByUserId,
		openedAt: session.openedAt.toISOString(),
		closedAt: session.closedAt?.toISOString() ?? null,
	}
}
