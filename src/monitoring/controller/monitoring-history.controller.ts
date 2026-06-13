import {
  Controller,
  Get,
  Query,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
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

    // Get start of today for DOWN count
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
    );
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    // Batch query: count number of DOWN events (transitions) per config
    const configIds = configs.map((c) => c.id);
    const downCounts: Array<{
      configId: number;
      downCountToday: bigint;
      downCountMonth: bigint;
    }> =
      configIds.length > 0
        ? await this.prisma.$queryRaw`
          SELECT 
            "configId", 
            SUM(CASE WHEN ("timestamp" >= ${todayStart}) AND ("prev_ts_month" IS NULL OR extract(epoch from ("timestamp" - "prev_ts_month")) > 3600) THEN 1 ELSE 0 END) as "downCountToday",
            SUM(CASE WHEN "prev_ts_month" IS NULL OR extract(epoch from ("timestamp" - "prev_ts_month")) > 3600 THEN 1 ELSE 0 END) as "downCountMonth"
          FROM (
            SELECT "configId", "status", "timestamp", 
                   LAG("timestamp") OVER (PARTITION BY "configId" ORDER BY "timestamp" ASC) as "prev_ts_month"
            FROM "MonitoringHistory"
            WHERE "configId" IN (${Prisma.join(configIds)})
              AND "timestamp" >= ${monthStart}
              AND "status" IN ('DOWN'::"NocStatus", 'NO_TRAFFIC'::"NocStatus")
          ) sub
          GROUP BY "configId"
        `
        : [];

    const downDayMap = new Map(
      downCounts.map((d) => [d.configId, Number(d.downCountToday)]),
    );
    const downMonthMap = new Map(
      downCounts.map((d) => [d.configId, Number(d.downCountMonth)]),
    );

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
          downCountToday: downDayMap.get(config.id) ?? 0,
          downCountMonth: downMonthMap.get(config.id) ?? 0,
          maintenance: config.maintenance,
          maintenanceLabel: config.maintenanceLabel,
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
