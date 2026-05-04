import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrtgModule } from './prtg/prtg.module';
import { WhatsappModule } from './whatsapp/whatsapp.module';

@Module({
  imports: [PrismaModule, AuthModule, WhatsappModule, PrtgModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
