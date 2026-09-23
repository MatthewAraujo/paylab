import { Prisma } from '@prisma/client'
import { SaleDraft } from '../../enterprise/entities/sale-draft'

export abstract class SaleDraftsRepository {
	abstract findOpenByPdvSessionId(pdvSessionId: string): Promise<SaleDraft | null>
	abstract findById(saleDraftId: string): Promise<SaleDraft | null>
	abstract save(draft: SaleDraft, tx?: Prisma.TransactionClient): Promise<void>
}
