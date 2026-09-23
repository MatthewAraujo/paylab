import { GetDailyReportUseCase } from '@/domain/paylab/application/use-cases/get-daily-report'
import { AuthModule } from '@/infra/auth/auth.module'
import { LedgerModule } from '@/infra/database/ledger.module'
import { Module } from '@nestjs/common'
import { ReportsController } from './controllers/reports.controller'

@Module({
	imports: [AuthModule, LedgerModule],
	controllers: [ReportsController],
	providers: [GetDailyReportUseCase],
})
export class ReportsModule {}
