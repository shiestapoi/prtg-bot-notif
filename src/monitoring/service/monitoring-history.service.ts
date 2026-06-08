import { Injectable } from '@nestjs/common';
import { NocStatus, type MonitoringHistory, type Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { QueryMonitoringHistoryDto } from '../dto/query-history.dto';

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

  constructor(private readonly prisma: PrismaService) {}

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
}
