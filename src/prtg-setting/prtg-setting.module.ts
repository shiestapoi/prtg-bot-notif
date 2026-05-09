import { Module } from '@nestjs/common';
import { PrtgSettingController } from './prtg-setting.controller';
import { PrtgSettingService } from './prtg-setting.service';

@Module({
  controllers: [PrtgSettingController],
  providers: [PrtgSettingService],
  exports: [PrtgSettingService],
})
export class PrtgSettingModule {}
