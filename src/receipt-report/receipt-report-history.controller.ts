import { Controller, Get, Post, Body, UseGuards, Query } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptReportService } from './receipt-report.service';
import { AuthGuard } from '../auth/auth.guard';
import { Prisma } from '@prisma/client';

@Controller('api/receipt-reports')
@UseGuards(AuthGuard)
export class ReceiptReportHistoryController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptReportService: ReceiptReportService,
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
}
