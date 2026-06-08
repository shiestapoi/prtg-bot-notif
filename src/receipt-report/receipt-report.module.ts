import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReceiptScheduleService } from './receipt-schedule.service';
import { ReceiptReportService } from './receipt-report.service';
import { ReceiptSchedulerService } from './receipt-scheduler.service';
import { ReceiptReportController } from './receipt-report.controller';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappModule)],
  controllers: [ReceiptReportController],
  providers: [ReceiptScheduleService, ReceiptReportService, ReceiptSchedulerService],
  exports: [ReceiptScheduleService, ReceiptReportService, ReceiptSchedulerService],
})
export class ReceiptReportModule {}
