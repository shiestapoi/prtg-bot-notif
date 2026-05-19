import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MonitoringHistoryService } from '../service/monitoring-history.service';
import { QueryMonitoringHistoryDto } from '../dto/query-history.dto';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * MonitoringHistoryController exposes endpoints for querying monitoring history
 * and retrieving a summary of all monitoring-enabled configs.
 *
 * Endpoints:
 * - GET /api/monitoring/history — Query history with optional filters (configId, from, to, status, limit, offset)
 * - GET /api/monitoring/summary — Get current status summary for all monitoring-enabled configs
 */
@Controller('api/monitoring')
export class MonitoringHistoryController {
  constructor(
    private readonly monitoringHistoryService: MonitoringHistoryService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * Query monitoring history records with optional filters.
   * All query parameters are optional and combinable.
   *
   * @param query - Filter parameters: configId, from, to, status, limit, offset
   * @returns Paginated history records with total count
   */
  @Get('history')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  query(@Query() query: QueryMonitoringHistoryDto) {
    return this.monitoringHistoryService.query(query);
  }

  /**
   * Get current status summary for all monitoring-enabled configs.
   * Returns configId, title, groupName, sensorId, lastStatus, lastPolledAt,
   * and the latest metric values (totalTrafficBitrate, inboundBitrate, outboundBitrate).
   */
  @Get('summary')
  async getSummary() {
    // Query all monitoring-enabled configs (monitoringEnabled = true)
    const configs = await this.prisma.prtgConfig.findMany({
      where: {
        monitoringEnabled: true,
      },
      include: {
        group: true,
      },
      orderBy: [{ groupId: 'asc' }, { title: 'asc' }],
    });

    // Get start of current month for DOWN count
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Batch query: count distinct DAYS with DOWN/NO_TRAFFIC per config this month
    // Using raw query to get COUNT(DISTINCT DATE(timestamp)) per configId
    const configIds = configs.map((c) => c.id);
    const downDayCounts: Array<{ configId: number; downDays: bigint }> = configIds.length > 0
      ? await this.prisma.$queryRaw`
          SELECT "configId", COUNT(DISTINCT DATE("timestamp")) as "downDays"
          FROM "MonitoringHistory"
          WHERE "configId" IN (${Prisma.join(configIds)})
            AND "status" IN ('DOWN'::"NocStatus", 'NO_TRAFFIC'::"NocStatus")
            AND "timestamp" >= ${monthStart}
          GROUP BY "configId"
        `
      : [];

    const downDayMap = new Map(downDayCounts.map((d) => [d.configId, Number(d.downDays)]));

    // For each config, get the latest MonitoringHistory record for metric data
    const summaryItems = await Promise.all(
      configs.map(async (config) => {
        const latestHistory = await this.prisma.monitoringHistory.findFirst({
          where: { configId: config.id },
          orderBy: { timestamp: 'desc' },
        });

        // If notifyLowTraffic is disabled, treat LOW_TRAFFIC as NORMAL for display
        let displayStatus = config.lastStatus;
        if (displayStatus === 'LOW_TRAFFIC' && !config.notifyLowTraffic) {
          displayStatus = 'NORMAL';
        }

        return {
          configId: config.id,
          title: config.title,
          groupName: config.group.name,
          sensorId: config.sensorId,
          lastStatus: displayStatus,
          lastPolledAt: config.lastPolledAt?.toISOString() ?? null,
          downCountThisMonth: downDayMap.get(config.id) ?? 0,
          lastMetric: latestHistory
            ? {
                totalTrafficBitrate: latestHistory.totalTrafficBitrate,
                inboundBitrate: latestHistory.inboundBitrate,
                outboundBitrate: latestHistory.outboundBitrate,
              }
            : null,
        };
      }),
    );

    return summaryItems;
  }
}
