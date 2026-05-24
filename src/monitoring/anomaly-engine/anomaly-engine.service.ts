import { Injectable } from '@nestjs/common';
import {
  NocStatus,
  NocSensitivity,
  type MonitoringHistory,
} from '@prisma/client';
import { type NormalizedMetric } from '../parser/metric-parser.service';

/**
 * Represents a monitoring-eligible PrtgConfig with all threshold/sensitivity fields.
 * This replaces the former NocMonitoredItem type in the classification input.
 */
export interface MonitoringEligibleConfig {
  id: number;
  title: string;
  sensorId: number; // For both chart URL and metric polling
  groupId: number;
  pollingInterval: number;
  thresholdLow: number;
  thresholdHigh: number;
  sensitivity: NocSensitivity;
  cooldownInterval: number;
  noTrafficCount: number;
  flappingWindow: number;
  flappingCount: number;
  downCount: number;
  rollingWindowSize: number;
  notifyDown: boolean;
  notifyNoTraffic: boolean;
  notifyLowTraffic: boolean;
  notifyFlapping: boolean;
  notifyRecovery: boolean;
  maintenance: boolean;
  lastPolledAt: Date | null;
  lastStatus: NocStatus;
}

/**
 * Input for the anomaly classification function.
 * Contains the current metric (null if fetch failed), config with thresholds,
 * recent history records, and the count of consecutive fetch errors.
 */
export interface ClassificationInput {
  /** The normalized metric from the current poll, or null if the fetch failed */
  metric: NormalizedMetric | null;
  /** The monitoring-eligible PrtgConfig with thresholds and sensitivity */
  config: MonitoringEligibleConfig;
  /** Recent history records (most recent first) for rolling average and pattern detection */
  recentHistory: MonitoringHistory[];
  /** Number of consecutive fetch errors (metric was null) */
  consecutiveErrors: number;
}

/**
 * Result of the anomaly classification.
 * Contains the determined status and a human-readable reason.
 */
export interface ClassificationResult {
  status: NocStatus;
  reason: string;
}

/**
 * Threshold for "down" — below this the link is essentially dead (in Mbit/s).
 * Covers both old DOWN (= 0) and NO_TRAFFIC (< 0.1) cases.
 */
const DOWN_THRESHOLD_MBPS = 1.0;

/**
 * Calculates the rolling average of totalTrafficBitrate from recent NORMAL history entries.
 *
 * Only considers entries with status === NORMAL and a non-null totalTrafficBitrate.
 * Takes the most recent `windowSize` qualifying entries.
 *
 * @param history - Recent history records (most recent first)
 * @param windowSize - Number of NORMAL entries to include in the average
 * @returns The rolling average bitrate, or 0 if no qualifying entries exist
 */
export function calculateRollingAverage(
  history: MonitoringHistory[],
  windowSize: number,
): number {
  const recentNormal = history
    .filter(
      (h) => h.status === NocStatus.NORMAL && h.totalTrafficBitrate !== null,
    )
    .slice(0, windowSize);

  if (recentNormal.length === 0) return 0;

  const sum = recentNormal.reduce(
    (acc, h) => acc + h.totalTrafficBitrate!,
    0,
  );
  return sum / recentNormal.length;
}

/**
 * AnomalyEngineService is a standalone classification service with no database dependencies.
 * It receives all data through its classify() method parameters and returns a classification result.
 *
 * Classification Priority (highest to lowest):
 * 1. DOWN — Traffic In < 1 Mbit/s (link dead or nearly dead)
 * 2. LOW_TRAFFIC — Traffic In dropped > 50% from rolling average (but still >= 1 Mbit/s)
 * 3. NORMAL — Traffic In >= 1 Mbit/s and stable
 *
 * Note: HTTP errors (PRTG unreachable) are handled separately by the scheduler
 * and reported to a static number — they don't classify as DOWN.
 */
@Injectable()
export class AnomalyEngineService {
  /**
   * Classifies the current state based on Traffic In speed.
   * Focus: detect when inbound traffic drops significantly.
   */
  classify(input: ClassificationInput): ClassificationResult {
    const { metric, config, recentHistory, consecutiveErrors } = input;

    // If metric is null (HTTP error / PRTG unreachable), report as NORMAL
    if (metric === null) {
      return {
        status: NocStatus.NORMAL,
        reason: `Fetch gagal (${consecutiveErrors} error) — PRTG mungkin tidak terjangkau`,
      };
    }

    // ═══ All classification based on Traffic In speed ═══
    const inboundBitrateMbps = (metric.inboundBitrate ?? 0) / 1_000_000;

    // Priority 1: DOWN — Traffic In < 1 Mbit/s (link dead or nearly dead)
    if (inboundBitrateMbps < DOWN_THRESHOLD_MBPS) {
      return {
        status: NocStatus.DOWN,
        reason: inboundBitrateMbps === 0
          ? 'Traffic In = 0 (link mati total)'
          : `Traffic In ${inboundBitrateMbps.toFixed(2)} Mbit/s (di bawah 1 Mbit/s)`,
      };
    }

    // Priority 2: LOW_TRAFFIC — sudden drop > thresholdLow% from rolling average
    const thresholdFraction = config.thresholdLow / 100;
    const rollingAvgIn = this.calculateInboundRollingAverage(recentHistory, config.rollingWindowSize);
    if (rollingAvgIn > 0 && inboundBitrateMbps < rollingAvgIn * (1 - thresholdFraction)) {
      // Get previous NORMAL Traffic In value for display (not current, not avg)
      const prevNormal = recentHistory.find(
        (h) => h.status === NocStatus.NORMAL && h.inboundBitrate !== null && h.inboundBitrate > 0,
      );
      const prevInbound = prevNormal
        ? (prevNormal.inboundBitrate! / 1_000_000).toFixed(2)
        : rollingAvgIn.toFixed(2);
      const dropPercent = ((1 - inboundBitrateMbps / rollingAvgIn) * 100).toFixed(0);
      return {
        status: NocStatus.LOW_TRAFFIC,
        reason: `Traffic In turun ${dropPercent}% — dari ${prevInbound} Mbit/s ke ${inboundBitrateMbps.toFixed(2)} Mbit/s`,
      };
    }

    // Priority 3: NORMAL
    return {
      status: NocStatus.NORMAL,
      reason: `Traffic In ${inboundBitrateMbps.toFixed(2)} Mbit/s — normal`,
    };
  }

  /**
   * Calculates rolling average of inbound bitrate from recent NORMAL history entries.
   */
  private calculateInboundRollingAverage(
    history: MonitoringHistory[],
    windowSize: number,
  ): number {
    const recentNormal = history
      .filter((h) => h.status === NocStatus.NORMAL && h.inboundBitrate !== null && h.inboundBitrate > 0)
      .slice(0, windowSize);

    if (recentNormal.length === 0) return 0;

    const sum = recentNormal.reduce((acc, h) => acc + (h.inboundBitrate ?? 0), 0);
    // Convert from bits/s to Mbit/s
    return (sum / recentNormal.length) / 1_000_000;
  }
}
