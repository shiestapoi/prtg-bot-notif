import { Body, Controller, Get, Patch } from '@nestjs/common';
import { UpdateSettingDto } from './dto/update-setting.dto';
import { PrtgSettingService } from './prtg-setting.service';

@Controller('api/prtg-setting')
export class PrtgSettingController {
  constructor(private readonly prtgSettingService: PrtgSettingService) {}

  @Get()
  getSetting() {
    return this.prtgSettingService.getSetting();
  }

  @Patch()
  updateSetting(@Body() dto: UpdateSettingDto) {
    return this.prtgSettingService.updateSetting(dto);
  }
}
