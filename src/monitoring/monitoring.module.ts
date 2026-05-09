import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CookieVaultModule } from '../cookie-vault/cookie-vault.module';
import { PrtgSettingModule } from '../prtg-setting/prtg-setting.module';
import { PrtgReportModule } from '../prtg-report/prtg-report.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

// Controllers
import { MonitoringHistoryController } from './controller/monitoring-history.controller';
import { MonitoringEventController } from './controller/monitoring-event.controller';
import { MonitoringController } from './controller/monitoring.controller';

// Services
import { MonitoringSchedulerService } from './scheduler/monitoring-scheduler.service';
import { MetricParserService } from './parser/metric-parser.service';
import { AnomalyEngineService } from './anomaly-engine/anomaly-engine.service';
import { AlertDispatcherService } from './dispatcher/alert-dispatcher.service';
import { BrowserPoolService } from './dispatcher/browser-pool.service';
import { ScreenshotService } from './dispatcher/screenshot.service';
import { MonitoringHistoryService } from './service/monitoring-history.service';
import { MonitoringEventService } from './scheduler/monitoring-event.service';

@Module({
  imports: [PrismaModule, CookieVaultModule, PrtgSettingModule, PrtgReportModule, WhatsappModule],
  controllers: [
    MonitoringHistoryController,
    MonitoringEventController,
    MonitoringController,
  ],
  providers: [
    BrowserPoolService,
    MonitoringSchedulerService,
    MetricParserService,
    AnomalyEngineService,
    AlertDispatcherService,
    ScreenshotService,
    MonitoringHistoryService,
    MonitoringEventService,
  ],
})
export class MonitoringModule {}
