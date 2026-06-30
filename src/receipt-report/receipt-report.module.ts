import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { ReceiptScheduleService } from './receipt-schedule.service';
import { ReceiptReportService } from './receipt-report.service';
import { ReceiptSchedulerService } from './receipt-scheduler.service';
import { ReceiptReportController } from './receipt-report.controller';
import { ReceiptReportPublicController } from './receipt-report-public.controller';
import { ReceiptRecipientController } from './receipt-recipient.controller';
import { ReceiptRecipientService } from './receipt-recipient.service';
import { ReceiptReportHistoryController } from './receipt-report-history.controller';
import { MonitoringModule } from '../monitoring/monitoring.module';
import { TelegramModule } from '../telegram/telegram.module';
import { StorageModule } from '../storage/storage.module';
import { PdfGeneratorService } from './pdf-generator.service';
import { ScreenshotModule } from '../monitoring/dispatcher/screenshot.module';
@Module({
  imports: [
    PrismaModule,
    AuthModule,
    forwardRef(() => WhatsappModule),
    forwardRef(() => MonitoringModule),
    forwardRef(() => TelegramModule),
    StorageModule,
    ScreenshotModule,
  ],
  controllers: [
    ReceiptReportController,
    ReceiptRecipientController,
    ReceiptReportPublicController,
    ReceiptReportHistoryController,
  ],
  providers: [
    ReceiptScheduleService,
    ReceiptReportService,
    ReceiptSchedulerService,
    ReceiptRecipientService,
    PdfGeneratorService,
  ],
  exports: [
    ReceiptScheduleService,
    ReceiptReportService,
    ReceiptSchedulerService,
    ReceiptRecipientService,
    PdfGeneratorService,
  ],
})
export class ReceiptReportModule {}
