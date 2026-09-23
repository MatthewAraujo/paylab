import { PaymentsRepository } from '@/domain/paylab/application/repositories/payments-repository'
import { Payment } from '@/domain/paylab/enterprise/entities/payment'
import { Injectable } from '@nestjs/common'
import { paymentInclude, paymentToDomain, paymentToPrisma } from '../mappers/payment-mapper'
import { PrismaService } from '../prisma.service'

@Injectable()
export class PrismaPaymentsRepository implements PaymentsRepository {
	constructor(private prisma: PrismaService) {}

	async findById(id: string): Promise<Payment | null> {
		const row = await this.prisma.payment.findUnique({ where: { id }, include: paymentInclude })

		return row ? paymentToDomain(row) : null
	}

	async findByIdempotencyKey(merchantId: string, idempotencyKey: string): Promise<Payment | null> {
		const row = await this.prisma.payment.findUnique({
			where: { merchantId_idempotencyKey: { merchantId, idempotencyKey } },
			include: paymentInclude,
		})

		return row ? paymentToDomain(row) : null
	}

	async create(payment: Payment): Promise<void> {
		await this.prisma.payment.create({ data: paymentToPrisma(payment) })
	}

	async save(payment: Payment): Promise<void> {
		const { id, ...data } = paymentToPrisma(payment)

		await this.prisma.payment.update({ where: { id }, data })
	}
}
