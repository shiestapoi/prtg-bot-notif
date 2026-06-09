import * as fs from 'fs';
import * as path from 'path';
import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  CreatePingMonitorDto,
  UpdatePingMonitorDto,
} from '../dto/ping-monitor.dto';
import { PingMonitorSchedulerService } from '../scheduler/ping-monitor-scheduler.service';
import { PingMonitorService } from '../service/ping-monitor.service';

@Controller('api/monitoring/ping-monitors')
export class PingMonitorController {
  constructor(
    private readonly service: PingMonitorService,
    private readonly scheduler: PingMonitorSchedulerService,
  ) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Post()
  async create(@Body() dto: CreatePingMonitorDto) {
    const created = await this.service.create(dto);
    await this.scheduler.sync();
    return created;
  }

  @Patch(':id')
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePingMonitorDto,
  ) {
    const updated = await this.service.update(id, dto);
    await this.scheduler.sync();
    return updated;
  }

  @Delete(':id')
  async remove(@Param('id', ParseIntPipe) id: number) {
    const result = await this.service.remove(id);
    await this.scheduler.sync();
    return result;
  }

  @Post(':id/poll')
  async poll(@Param('id', ParseIntPipe) id: number) {
    if (!(await this.scheduler.pollNow(id))) {
      throw new NotFoundException('Ping monitor not found.');
    }
    return this.service.findOne(id);
  }

  @Get('logs')
  getLogs() {
    const logFilePath = path.join(process.cwd(), 'temp', 'ping.log');
    if (!fs.existsSync(logFilePath)) {
      return { logs: [] };
    }

    try {
      const content = fs.readFileSync(logFilePath, 'utf-8');
      const lines = content.split('\n').filter((l) => l.trim().length > 0);
      // Return last 200 lines to avoid massive payloads
      const recentLines = lines.slice(-200);

      const logs = recentLines.map((line) => {
        const parts = line.split(' | ');
        if (parts.length >= 5) {
          return {
            timestamp: parts[0],
            name: parts[1],
            host: parts[2],
            status: parts[3],
            latencyMs: parts[4],
          };
        }
        return null;
      }).filter(Boolean);

      return { logs };
    } catch (err) {
      return { logs: [] };
    }
  }
}
