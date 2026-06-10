import { Module, Global } from '@nestjs/common';
import { TaskService } from './task.service';
import { MonitoringEventModule } from '../monitoring/scheduler/monitoring-event.module';

@Global()
@Module({
  imports: [MonitoringEventModule],
  providers: [TaskService],
  exports: [TaskService],
})
export class TaskModule {}
