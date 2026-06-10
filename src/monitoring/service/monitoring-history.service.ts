import { Injectable } from '@nestjs/common';
import { NocStatus, type MonitoringHistory, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryMonitoringHistoryDto } from '../dto/query-history.dto';
import axios from 'axios';
import { PrtgSettingService } from '../../prtg-setting/prtg-setting.service';
import { MetricParserService } from '../parser/metric-parser.service';
import { AnomalyEngineService } from '../anomaly-engine/anomaly-engine.service';

/**
 * Persist data shape used by the scheduler when storing a history record.
 */
export interface PersistMonitoringHistoryData {
  configId: number;
  timestamp: Date;
  status: NocStatus;
  totalTrafficBytes?: number | null;
  totalTrafficBitrate?: number | null;
  inboundBytes?: number | null;
  inboundBitrate?: number | null;
  outboundBytes?: number | null;
  outboundBitrate?: number | null;
  errorPercent?: number | null;
  coveragePercent?: number | null;
  rawInboundBitrate?: number | null;
  rawOutboundBitrate?: number | null;
  errorMessage?: string | null;
  rawResponse?: string | null;
}

/**
 * MonitoringHistoryService handles persistence and querying of monitoring history.
 *
 * Methods:
 * - persist(data) — Creates a new MonitoringHistory record (used by the scheduler)
 * - query(filters) — Queries history with optional filters (configId, time range, status, pagination)
 * - getRecentByConfig(configId, count) — Gets the most recent N history records for a config
 */
@Injectable()
export class MonitoringHistoryService {
  /** Default query limit to prevent unbounded result sets */
  private static readonly DEFAULT_LIMIT = 100;
  private static readonly MAX_LIMIT = 1000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prtgSetting: PrtgSettingService,
    private readonly metricParser: MetricParserService,
    private readonly anomalyEngine: AnomalyEngineService,
  ) {}

  /**
   * Persist a new MonitoringHistory record.
   * Primarily used internally by the scheduler after each polling cycle.
   */
  async persist(
    data: PersistMonitoringHistoryData,
  ): Promise<MonitoringHistory> {
    return this.prisma.monitoringHistory.create({
      data: {
        configId: data.configId,
        timestamp: data.timestamp,
        status: data.status,
        totalTrafficBytes: data.totalTrafficBytes ?? null,
        totalTrafficBitrate: data.totalTrafficBitrate ?? null,
        inboundBytes: data.inboundBytes ?? null,
        inboundBitrate: data.inboundBitrate ?? null,
        outboundBytes: data.outboundBytes ?? null,
        outboundBitrate: data.outboundBitrate ?? null,
        errorPercent: data.errorPercent ?? null,
        coveragePercent: data.coveragePercent ?? null,
        rawInboundBitrate: data.rawInboundBitrate ?? null,
        rawOutboundBitrate: data.rawOutboundBitrate ?? null,
        errorMessage: data.errorMessage ?? null,
        rawResponse: data.rawResponse ?? null,
      },
    });
  }

  /**
   * Query history records with optional filters.
   * Supports filtering by configId, time range (from/to), and status.
   * Results are ordered by timestamp descending.
   * Supports pagination via limit/offset.
   */
  async query(filters: QueryMonitoringHistoryDto): Promise<{
    data: MonitoringHistory[];
    total: number;
    limit: number;
    offset: number;
  }> {
    const where: Prisma.MonitoringHistoryWhereInput = {};

    if (filters.configId) {
      where.configId = filters.configId;
    }

    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) {
        where.timestamp.gte = new Date(filters.from);
      }
      if (filters.to) {
        where.timestamp.lte = new Date(filters.to);
      }
    }

    if (filters.status) {
      where.status = filters.status;
    }

    const limit = Math.min(
      filters.limit ?? MonitoringHistoryService.DEFAULT_LIMIT,
      MonitoringHistoryService.MAX_LIMIT,
    );
    const offset = filters.offset ?? 0;

    const [data, total] = await Promise.all([
      this.prisma.monitoringHistory.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.monitoringHistory.count({ where }),
    ]);

    return { data, total, limit, offset };
  }

  /**
   * Get the most recent N history records for a specific config.
   * Used by the anomaly engine for rolling window calculations.
   */
  async getRecentByConfig(
    configId: number,
    count: number,
  ): Promise<MonitoringHistory[]> {
    return this.prisma.monitoringHistory.findMany({
      where: { configId },
      orderBy: { timestamp: 'desc' },
      take: count,
    });
  }

  /**
   * Sync historical data from PRTG API to fill gaps or overwrite errors in local database.
   */
  async syncFromPrtg(
    configId: number,
    startDate: Date,
    endDate: Date,
  ): Promise<number> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id: configId },
      include: { group: true },
    });

    if (!config || !config.monitoringEnabled) {
      throw new Error('Config not found or monitoring not enabled');
    }

    // Skip syncing if config is currently in maintenance
    if (config.maintenance) {
      return 0;
    }

    const settings = await this.prtgSetting.getSettingRaw();
    if (!settings.loginUsername || !settings.loginPassword) {
      throw new Error('PRTG credentials not configured');
    }

    const baseUrlRaw = settings.loginUrl ?? 'http://prtg.r1net.id';
    let baseUrl: URL;
    try {
      baseUrl = new URL(baseUrlRaw);
    } catch {
      baseUrl = new URL(`http://${baseUrlRaw}`);
    }

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

    const url = `${baseUrl.protocol}//${baseUrl.host}/api/historicdata.json?id=${config.sensorId}&avg=0&sdate=${formatDate(startDate)}&edate=${formatDate(endDate)}&usecaption=1&username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;

    const response = await axios.get(url, {
      timeout: 30000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      throw new Error(`PRTG API HTTP ${response.status}`);
    }

    const rawText =
      typeof response.data === 'string'
        ? response.data
        : JSON.stringify(response.data);

    const metrics = this.metricParser.normalizeAll(rawText, configId);
    if (!metrics || metrics.length === 0) {
      return 0;
    }

    let upsertCount = 0;
    const historyConfig = {
      id: config.id,
      title: config.title,
      sensorId: config.sensorId,
      groupId: config.groupId,
      pollingInterval: config.pollingInterval,
      thresholdLow: config.thresholdLow,
      thresholdHigh: config.thresholdHigh,
      sensitivity: config.sensitivity,
      cooldownInterval: config.cooldownInterval,
      noTrafficCount: config.noTrafficCount,
      flappingWindow: config.flappingWindow,
      flappingCount: config.flappingCount,
      downCount: config.downCount,
      rollingWindowSize: config.rollingWindowSize,
      notifyDown: config.notifyDown,
      notifyNoTraffic: config.notifyNoTraffic,
      notifyLowTraffic: config.notifyLowTraffic,
      notifyFlapping: config.notifyFlapping,
      notifyRecovery: config.notifyRecovery,
      maintenance: config.maintenance,
      maintenanceLabel: config.maintenanceLabel,
      minTrafficThreshold: config.minTrafficThreshold,
      lastPolledAt: config.lastPolledAt,
      lastStatus: config.lastStatus,
    };

    // Process each metric and upsert into database
    for (const metric of metrics) {
      // Create a fake classification for historical data based on simple thresholds
      let status: NocStatus = NocStatus.NORMAL;
      if (config.maintenance) {
        status = NocStatus.MAINTENANCE;
      } else {
        const inboundMbps = (metric.inboundBitrate ?? 0) / 1000000;
        if (metric.errorPercent !== null && metric.errorPercent > 0) {
          status = NocStatus.DOWN;
        } else if (inboundMbps < config.downThreshold) {
          status = NocStatus.DOWN;
        } else if (
          metric.totalTrafficBitrate !== null &&
          metric.totalTrafficBitrate < config.thresholdLow
        ) {
          status = NocStatus.LOW_TRAFFIC;
        }
      }

      // Find if there's an existing record within 30 seconds of this timestamp
      const existing = await this.prisma.monitoringHistory.findFirst({
        where: {
          configId,
          timestamp: {
            gte: new Date(metric.timestamp.getTime() - 30000),
            lte: new Date(metric.timestamp.getTime() + 30000),
          },
        },
      });

      const dataToSave = {
        configId,
        timestamp: metric.timestamp,
        status,
        totalTrafficBytes: metric.totalTrafficBytes ?? null,
        totalTrafficBitrate: metric.totalTrafficBitrate ?? null,
        inboundBytes: metric.inboundBytes ?? null,
        inboundBitrate: metric.inboundBitrate ?? null,
        outboundBytes: metric.outboundBytes ?? null,
        outboundBitrate: metric.outboundBitrate ?? null,
        errorPercent: metric.errorPercent ?? null,
        coveragePercent: metric.coveragePercent ?? null,
        rawInboundBitrate: metric.inboundBitrate ?? null,
        rawOutboundBitrate: metric.outboundBitrate ?? null,
        errorMessage: null,
        rawResponse: 'SYNCED_FROM_PRTG',
      };

      if (existing) {
        // Selalu timpa dengan data PRTG (Source of Truth) sesuai permintaan user
        await this.prisma.monitoringHistory.update({
          where: { id: existing.id },
          data: dataToSave,
        });
        upsertCount++;
      } else {
        await this.prisma.monitoringHistory.create({
          data: dataToSave,
        });
        upsertCount++;
      }
    }

    return upsertCount;
  }
}
