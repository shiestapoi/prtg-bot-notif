import { forwardRef, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WhatsappModule } from '../whatsapp/whatsapp.module';
import { PrtgController } from './prtg.controller';
import { PrtgSchedulerService } from './prtg.scheduler.service';
import { PrtgService } from './prtg.service';

@Module({
  imports: [AuthModule, forwardRef(() => WhatsappModule)],
  controllers: [PrtgController],
  providers: [PrtgService, PrtgSchedulerService],
  exports: [PrtgService, PrtgSchedulerService],
})
export class PrtgModule {}
