import { Module } from '@nestjs/common';
import { TelegramService } from './telegram.service';
import { TelegramSenderService } from './telegram-sender.service';
import { TelegramAdminController } from './telegram-admin.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { PrtgReportModule } from '../prtg-report/prtg-report.module';
import { ReceiptReportModule } from '../receipt-report/receipt-report.module';
import { ScreenshotModule } from '../monitoring/dispatcher/screenshot.module';

@Module({
  imports: [PrismaModule, AuthModule, PrtgReportModule, ReceiptReportModule, ScreenshotModule],
  providers: [
    TelegramService,
    TelegramSenderService
  ],
  controllers: [TelegramAdminController],
  exports: [TelegramSenderService],
})
export class TelegramModule {}
