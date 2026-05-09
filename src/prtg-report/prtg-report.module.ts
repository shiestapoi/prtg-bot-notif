import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CookieVaultModule } from '../cookie-vault/cookie-vault.module';
import { PrtgSettingModule } from '../prtg-setting/prtg-setting.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrtgReportController } from './prtg-report.controller';
import { PrtgReportSchedulerService } from './prtg-report-scheduler.service';
import { PrtgReportService } from './prtg-report.service';

@Module({
  imports: [
    AuthModule,
    CookieVaultModule,
    PrtgSettingModule,
    forwardRef(() => WhatsappModule),
  ],
  controllers: [PrtgReportController],
  providers: [PrtgReportService, PrtgReportSchedulerService],
  exports: [PrtgReportService, PrtgReportSchedulerService],
})
export class PrtgReportModule {}
