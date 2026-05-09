import { Module } from '@nestjs/common';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { AppController } from './app.controller';
import { AuthModule } from './auth/auth.module';
import { CookieVaultModule } from './cookie-vault/cookie-vault.module';
import { PrismaModule } from './prisma/prisma.module';
import { MonitoringModule } from './monitoring/monitoring.module';
import { PrtgNocModule } from './prtg-noc/prtg-noc.module';
import { PrtgReportModule } from './prtg-report/prtg-report.module';
import { PrtgSettingModule } from './prtg-setting/prtg-setting.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    WhatsappModule,
    CookieVaultModule,
    PrtgSettingModule,
    PrtgReportModule,
    PrtgNocModule,
    MonitoringModule,
    // ServeStaticModule serves the React SPA from public/app/
    // renderPath '/' makes it serve index.html for ALL non-excluded paths (SPA fallback)
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'public', 'app'),
      renderPath: /^(?!\/api\/).*/,
    }),
  ],
  controllers: [AppController],
})
export class AppModule {}
