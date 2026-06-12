import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Query,
  Param,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptReportService } from './receipt-report.service';
import { AuthGuard } from '../auth/auth.guard';
import { Prisma } from '@prisma/client';
import { MonitoringHistoryService } from '../monitoring/service/monitoring-history.service';

import { TaskService } from '../task/task.service';

@Controller('api/receipt-reports')
@UseGuards(AuthGuard)
export class ReceiptReportHistoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptReportService: ReceiptReportService,
    private readonly monitoringHistory: MonitoringHistoryService,
    private readonly taskService: TaskService,
  ) {}

  @Get()
  async getHistory(@Query('limit') limit = 50) {
    return this.prisma.receiptReportSnapshot.findMany({
      orderBy: { createdAt: 'desc' },
      take: Number(limit),
      select: {
        id: true,
        period: true,
        groupName: true,
        startDate: true,
        endDate: true,
        createdAt: true,
      },
    });
  }

  @Post('manual-generate')
  async manualGenerate(
    @Body()
    body: {
      scheduleId?: number;
      period?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
      groupId?: number;
    },
  ) {
    // If scheduleId is provided, generate based on that schedule
    if (body.scheduleId) {
      const schedule = await this.prisma.receiptSchedule.findUnique({
        where: { id: body.scheduleId },
        include: { group: true },
      });
      if (schedule) {
        return this.receiptReportService.dispatchSchedule(schedule);
      }
    }

    // Otherwise ad-hoc generation is not fully supported in dispatchSchedule right now
    // unless we create a fake schedule object.
    const fakeSchedule: any = {
      id: 0,
      name: 'Manual Generate',
      period: body.period || 'DAILY',
      groupId: body.groupId || null,
      targetMode: 'group_only',
      includeDown: true,
      includeLowTraffic: true,
      includeLink: true,
      group: body.groupId
        ? await this.prisma.prtgGroup.findUnique({
            where: { id: body.groupId },
          })
        : null,
    };

    return this.receiptReportService.dispatchSchedule(fakeSchedule);
  }

  @Post(':id/update')
  async updateSnapshot(@Param('id') id: string) {
    return this.receiptReportService.updateSnapshot(id);
  }

  @Post('sync-history')
  async syncHistory(
    @Body()
    body: {
      startDate: string;
      endDate: string;
      groupId?: number;
    },
  ) {
    if (!body.startDate || !body.endDate) {
      throw new Error('startDate and endDate are required');
    }

    const start = new Date(body.startDate);
    const end = new Date(body.endDate);

    const configs = await this.prisma.prtgConfig.findMany({
      where: body.groupId
        ? { groupId: body.groupId, enabled: true, monitoringEnabled: true }
        : { enabled: true, monitoringEnabled: true },
    });

    const taskId = this.taskService.startTask(
      configs.length,
      `Memulai sinkronisasi ${configs.length} sensor...`,
    );

    // Run in background
    (async () => {
      try {
        let totalUpserted = 0;
        let processedCount = 0;
        const concurrency = 10;

        for (let i = 0; i < configs.length; i += concurrency) {
          const chunk = configs.slice(i, i + concurrency);
          const results = await Promise.all(
            chunk.map(async (config) => {
              try {
                return await this.monitoringHistory.syncFromPrtg(
                  config.id,
                  start,
                  end,
                );
              } catch (err) {
                console.error(`Failed to sync config ${config.id}:`, err);
                return 0;
              }
            }),
          );

          processedCount += chunk.length;
          totalUpserted += results.reduce((a, b) => a + b, 0);

          this.taskService.updateProgress(
            taskId,
            processedCount,
            `Sinkronisasi berjalan: ${processedCount}/${configs.length} sensor...`,
          );
        }

        this.taskService.completeTask(
          taskId,
          `Sinkronisasi selesai! Total ${totalUpserted} data berhasil ditarik.`,
        );
      } catch (error: any) {
        this.taskService.failTask(taskId, `Gagal: ${error.message}`);
      }
    })();

    return { success: true, taskId, message: 'Sync started in background' };
  }
}
