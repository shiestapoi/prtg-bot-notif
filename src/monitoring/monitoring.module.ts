import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
// Cookie tidak dipakai lagi — auth sekarang menggunakan username/passhash query params
// import { CookieVaultModule } from '../cookie-vault/cookie-vault.module';
import { PrtgSettingModule } from '../prtg-setting/prtg-setting.module';
import { PrtgReportModule } from '../prtg-report/prtg-report.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';

// Controllers
import { MonitoringHistoryController } from './controller/monitoring-history.controller';
import { MonitoringEventController } from './controller/monitoring-event.controller';
import { MonitoringController } from './controller/monitoring.controller';
import { MonitoringRecipientController } from './controller/monitoring-recipient.controller';
import { PingMonitorController } from './controller/ping-monitor.controller';
import { PingRecipientController } from './controller/ping-recipient.controller';

// Services
import { MonitoringSchedulerService } from './scheduler/monitoring-scheduler.service';
import { MetricParserService } from './parser/metric-parser.service';
import { AnomalyEngineService } from './anomaly-engine/anomaly-engine.service';
import { AlertDispatcherService } from './dispatcher/alert-dispatcher.service';
import { BrowserPoolService } from './dispatcher/browser-pool.service';
import { ScreenshotService } from './dispatcher/screenshot.service';
import { MonitoringHistoryService } from './service/monitoring-history.service';
import { MonitoringRecipientService } from './service/monitoring-recipient.service';
import { PingMonitorService } from './service/ping-monitor.service';
import { PingRecipientService } from './service/ping-recipient.service';
import { PingMonitorSchedulerService } from './scheduler/ping-monitor-scheduler.service';

@Module({
  imports: [PrismaModule, PrtgSettingModule, PrtgReportModule, WhatsappModule],
  controllers: [
    MonitoringHistoryController,
    MonitoringEventController,
    MonitoringController,
    MonitoringRecipientController,
    PingMonitorController,
    PingRecipientController,
  ],
  providers: [
    BrowserPoolService,
    MonitoringSchedulerService,
    MetricParserService,
    AnomalyEngineService,
    AlertDispatcherService,
    ScreenshotService,
    MonitoringHistoryService,
    MonitoringRecipientService,
    PingMonitorService,
    PingRecipientService,
    PingMonitorSchedulerService,
  ],
  exports: [
    MonitoringHistoryService,
  ],
})
export class MonitoringModule {}
