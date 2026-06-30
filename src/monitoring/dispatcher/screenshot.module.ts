import { Module } from '@nestjs/common';
import { ScreenshotService } from './screenshot.service';
import { BrowserPoolService } from './browser-pool.service';
import { PrtgSettingModule } from '../../prtg-setting/prtg-setting.module';

@Module({
  imports: [PrtgSettingModule],
  providers: [ScreenshotService, BrowserPoolService],
  exports: [ScreenshotService, BrowserPoolService],
})
export class ScreenshotModule {}
