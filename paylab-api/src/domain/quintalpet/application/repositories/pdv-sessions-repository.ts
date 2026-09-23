import { Prisma } from '@prisma/client'
import { PdvSession } from '../../enterprise/entities/pdv-session'

export abstract class PdvSessionsRepository {
	abstract findOpenByStoreId(storeId: string): Promise<PdvSession | null>
	abstract findById(pdvSessionId: string, storeId: string): Promise<PdvSession | null>
	abstract save(session: PdvSession, tx?: Prisma.TransactionClient): Promise<void>
}
