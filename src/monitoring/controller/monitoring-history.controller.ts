import { Controller, Get, Query, UsePipes, ValidationPipe } from '@nestjs/common';
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

    // For each config, get the latest MonitoringHistory record for metric data
    const summaryItems = await Promise.all(
      configs.map(async (config) => {
        const latestHistory = await this.prisma.monitoringHistory.findFirst({
          where: { configId: config.id },
          orderBy: { timestamp: 'desc' },
        });

        return {
          configId: config.id,
          title: config.title,
          groupName: config.group.name,
          sensorId: config.sensorId,
          lastStatus: config.lastStatus,
          lastPolledAt: config.lastPolledAt?.toISOString() ?? null,
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
