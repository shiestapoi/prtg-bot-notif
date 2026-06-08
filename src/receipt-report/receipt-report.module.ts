import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReceiptScheduleService } from './receipt-schedule.service';
import { ReceiptReportService } from './receipt-report.service';
import { ReceiptSchedulerService } from './receipt-scheduler.service';
import { ReceiptReportController } from './receipt-report.controller';
import { ReceiptReportPublicController } from './receipt-report-public.controller';
import { ReceiptRecipientController } from './receipt-recipient.controller';
import { ReceiptRecipientService } from './receipt-recipient.service';

@Module({
  imports: [PrismaModule, forwardRef(() => WhatsappModule)],
  controllers: [ReceiptReportController, ReceiptRecipientController, ReceiptReportPublicController],
  providers: [ReceiptScheduleService, ReceiptReportService, ReceiptSchedulerService, ReceiptRecipientService],
  exports: [ReceiptScheduleService, ReceiptReportService, ReceiptSchedulerService, ReceiptRecipientService],
})
export class ReceiptReportModule {}
