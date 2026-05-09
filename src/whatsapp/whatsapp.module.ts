import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrtgReportModule } from '../prtg-report/prtg-report.module';
import { WhatsappController } from './whatsapp.controller';
import { HelpPlugin } from './plugins/help.plugin';
import { PrtgAdminPlugin } from './plugins/prtg-admin.plugin';
import { PrtgGroupPlugin } from './plugins/prtg-group.plugin';
import { StatusPlugin } from './plugins/status.plugin';
import { WhatsappRealtimeService } from './whatsapp-realtime.service';
import { WhatsappSenderService } from './whatsapp-sender.service';
import { WhatsappSocketStore } from './whatsapp-socket.store';
import { WhatsappService } from './whatsapp.service';

@Module({
  imports: [AuthModule, forwardRef(() => PrtgReportModule)],
  controllers: [WhatsappController],
  providers: [
    WhatsappRealtimeService,
    WhatsappSocketStore,
    WhatsappSenderService,
    HelpPlugin,
    StatusPlugin,
    PrtgAdminPlugin,
    PrtgGroupPlugin,
    WhatsappService,
  ],
  exports: [WhatsappService, WhatsappSenderService, WhatsappSocketStore],
})
export class WhatsappModule {}
