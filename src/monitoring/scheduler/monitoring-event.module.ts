import { Global, Module } from '@nestjs/common';
import { MonitoringEventService } from './monitoring-event.service';

@Global()
@Module({
  providers: [MonitoringEventService],
  exports: [MonitoringEventService],
})
export class MonitoringEventModule {}
