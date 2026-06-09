import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import axios from 'axios';
import { NocStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PrtgSettingService } from '../../prtg-setting/prtg-setting.service';
import {
  MetricParserService,
  MetricParseError,
  type NormalizedMetric,
} from '../parser/metric-parser.service';
import { AnomalyEngineService } from '../anomaly-engine/anomaly-engine.service';
import type { MonitoringEligibleConfig } from '../anomaly-engine/anomaly-engine.service';
import { AlertDispatcherService } from '../dispatcher/alert-dispatcher.service';
import { MonitoringEventService } from './monitoring-event.service';
import { MonitoringHistoryService } from '../service/monitoring-history.service';

/**
 * MonitoringSchedulerService manages per-config polling intervals for unified monitoring.
 *
 * Key design decisions:
 * - Uses setInterval per config (not cron) since intervals are in seconds
 * - Concurrency controlled via a semaphore pattern (configurable limit)
 * - Completely independent from PrtgReportSchedulerService (report cron jobs)
 * - Config start/stop triggered by CRUD operations on PrtgConfig
 * - One config's failure does not affect others (resilient design)
 * - Only makes HTTP GET requests to PRTG (readonly constraint, Req 12.1, 12.2)
 * - Queries PrtgConfig WHERE monitoringEnabled = true AND enabled = true AND group.enabled = true
 */
@Injectable()
export class MonitoringSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(MonitoringSchedulerService.name);

  /** Active polling intervals keyed by PrtgConfig ID */
  private readonly intervals: Map<number, NodeJS.Timeout> = new Map();

  /** Tracks consecutive fetch errors per config */
  private readonly consecutiveErrors: Map<number, number> = new Map();

  /** Tracks last notification time per config for cooldown */
  private readonly lastNotifiedAt: Map<number, Date> = new Map();

  /** Tracks the last notified anomaly status per config (to detect same-status bouncing vs new anomaly) */
  private readonly lastNotifiedStatus: Map<number, NocStatus> = new Map();

  /** Tracks when a config first became NORMAL after an anomaly (for recovery grace period) */
  private readonly recoveryStartedAt: Map<number, Date> = new Map();

  /** Prevents concurrent polls for the same config (race condition guard) */
  private readonly pollInProgress: Set<number> = new Set();

  /** Recovery grace period in ms — must be NORMAL for this long before sending recovery notif */
  private readonly RECOVERY_GRACE_MS = 10 * 60 * 1000; // 10 minutes

  /** Cooldown for anomaly↔anomaly transitions (e.g., DOWN↔LOW_TRAFFIC): 1 hour */
  private readonly ESCALATION_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

  /** Re-notification interval for persistent DOWN status: 1 hour */
  private readonly PERSISTENT_DOWN_RENOTIFY_MS = 60 * 60 * 1000; // 1 hour

  /** Semaphore: current number of active concurrent polls */
  private activePollCount = 0;

  /** Configurable concurrency limit for simultaneous polls */
  private readonly concurrencyLimit: number;

  /** Queue of pending poll operations waiting for a semaphore slot */
  private readonly pollQueue: Array<() => void> = [];

  /** Periodic sync interval to detect new/changed configs */
  private syncInterval: NodeJS.Timeout | null = null;

  /** Interval for daily automatic PRTG historical data sync */
  private dailySyncInterval: NodeJS.Timeout | null = null;
  private lastDailySyncDate: number | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly prtgSetting: PrtgSettingService,
    private readonly metricParser: MetricParserService,
    private readonly anomalyEngine: AnomalyEngineService,
    private readonly dispatcher: AlertDispatcherService,
    private readonly eventService: MonitoringEventService,
    private readonly historyService: MonitoringHistoryService,
  ) {
    this.concurrencyLimit = parseInt(
      process.env.MONITORING_CONCURRENCY_LIMIT ?? '5',
      10,
    );
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.startAllEnabled();
    } catch (error) {
      this.logger.warn(
        `Monitoring scheduler start skipped; database may not be ready: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // Periodically check for new/changed configs every 30 seconds
    this.syncInterval = setInterval(() => this.syncConfigs(), 30000);

    // Check for daily sync every hour
    this.dailySyncInterval = setInterval(
      () => this.runDailySync(),
      60 * 60 * 1000,
    );
    // Also run it once shortly after startup just in case we missed it
    setTimeout(() => this.runDailySync(), 60000);
  }

  onModuleDestroy(): void {
    this.stopAll();
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.dailySyncInterval) {
      clearInterval(this.dailySyncInterval);
      this.dailySyncInterval = null;
    }
  }

  /**
   * Runs the automatic PRTG historical data sync once per day (at 01:00 AM)
   */
  private async runDailySync() {
    const now = new Date();
    // Run at 1 AM
    if (now.getHours() === 1 && this.lastDailySyncDate !== now.getDate()) {
      this.lastDailySyncDate = now.getDate();
      this.logger.log('Running daily automatic PRTG history sync');

      try {
        const configs = await this.getEligibleConfigs();
        const startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        let totalUpserted = 0;
        for (const config of configs) {
          try {
            const count = await this.historyService.syncFromPrtg(
              config.id,
              startDate,
              now,
            );
            totalUpserted += count;
          } catch (e) {
            this.logger.warn(
              `Daily sync failed for config ${config.id}: ${e instanceof Error ? e.message : String(e)}`,
            );
          }
        }
        this.logger.log(
          `Daily sync completed. Upserted ${totalUpserted} missing/error records.`,
        );
      } catch (err) {
        this.logger.error(
          `Daily sync failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  /**
   * Starts polling for all eligible monitoring-enabled configs.
   * Eligibility: monitoringEnabled = true AND enabled = true AND group.enabled = true
   */
  async startAllEnabled(): Promise<void> {
    const configs = await this.getEligibleConfigs();

    this.logger.log(
      `Starting polling for ${configs.length} monitoring-enabled configs`,
    );

    for (const config of configs) {
      this.scheduleConfig(config);
    }
  }

  /**
   * Queries all monitoring-eligible PrtgConfig entries.
   * Filter: monitoringEnabled = true AND enabled = true AND group.enabled = true
   */
  async getEligibleConfigs(): Promise<MonitoringEligibleConfig[]> {
    const configs = await this.prisma.prtgConfig.findMany({
      where: {
        monitoringEnabled: true,
        enabled: true,
        group: { enabled: true },
      },
      include: { group: true },
    });

    return configs.map((c) => ({
      id: c.id,
      title: c.title,
      sensorId: c.sensorId,
      groupId: c.groupId,
      pollingInterval: c.pollingInterval,
      thresholdLow: c.thresholdLow,
      thresholdHigh: c.thresholdHigh,
      sensitivity: c.sensitivity,
      cooldownInterval: c.cooldownInterval,
      noTrafficCount: c.noTrafficCount,
      flappingWindow: c.flappingWindow,
      flappingCount: c.flappingCount,
      downCount: c.downCount,
      rollingWindowSize: c.rollingWindowSize,
      notifyDown: c.notifyDown,
      notifyNoTraffic: c.notifyNoTraffic,
      notifyLowTraffic: c.notifyLowTraffic,
      notifyFlapping: c.notifyFlapping,
      notifyRecovery: c.notifyRecovery,
      maintenance: c.maintenance,
      maintenanceLabel: c.maintenanceLabel,
      minTrafficThreshold: c.minTrafficThreshold,
      lastPolledAt: c.lastPolledAt,
      lastStatus: c.lastStatus,
    }));
  }

  /**
   * Starts polling for a specific config by ID.
   * Fetches the config from the database and schedules it if eligible.
   */
  async startConfig(configId: number): Promise<void> {
    // Stop existing interval if any
    this.stopConfig(configId);

    const config = await this.prisma.prtgConfig.findUnique({
      where: { id: configId },
      include: { group: true },
    });

    if (!config) {
      this.logger.warn(`Cannot start config ${configId}: not found`);
      return;
    }

    if (!config.monitoringEnabled || !config.enabled || !config.group.enabled) {
      this.logger.debug(
        `Skipping config ${configId} (${config.title}): not eligible for monitoring`,
      );
      return;
    }

    const eligible: MonitoringEligibleConfig = {
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

    this.scheduleConfig(eligible);
    this.logger.log(`Started polling for config ${configId} (${config.title})`);
  }

  /**
   * Stops polling for a specific config by ID.
   */
  stopConfig(configId: number): void {
    const interval = this.intervals.get(configId);
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(configId);
      this.logger.debug(`Stopped polling for config ${configId}`);
    }
  }

  /**
   * Triggers a single immediate poll for a specific config by ID.
   * Does not affect the scheduled interval — this is a one-off manual trigger.
   * Returns true if the poll was executed, false if the config is not eligible.
   */
  async pollNow(configId: number): Promise<boolean> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id: configId },
      include: { group: true },
    });

    if (!config) {
      return false;
    }

    if (!config.monitoringEnabled || !config.enabled || !config.group.enabled) {
      return false;
    }

    await this.doPoll(configId);
    return true;
  }

  /**
   * Stops all active polling intervals.
   */
  stopAll(): void {
    for (const [configId, interval] of this.intervals) {
      clearInterval(interval);
      this.logger.debug(`Stopped polling for config ${configId}`);
    }
    this.intervals.clear();
    this.consecutiveErrors.clear();
    this.lastNotifiedAt.clear();
    this.pollInProgress.clear();
    this.activePollCount = 0;
    this.pollQueue.length = 0;
    this.logger.log('All polling intervals stopped');
  }

  /**
   * Syncs the running intervals with the database.
   * Starts new eligible configs, stops removed/disabled ones.
   * Called every 30 seconds to pick up config changes without requiring a restart.
   */
  private async syncConfigs(): Promise<void> {
    try {
      const eligible = await this.getEligibleConfigs();
      const eligibleIds = new Set(eligible.map((c) => c.id));

      // Stop configs that are no longer eligible
      for (const [configId] of this.intervals) {
        if (!eligibleIds.has(configId)) {
          this.stopConfig(configId);
        }
      }

      // Start new eligible configs that aren't running yet
      for (const config of eligible) {
        if (!this.intervals.has(config.id)) {
          this.scheduleConfig(config);
          this.logger.log(
            `Auto-started monitoring for new config ${config.id} (${config.title})`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Config sync failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Schedules a setInterval for the given config.
   */
  private scheduleConfig(config: MonitoringEligibleConfig): void {
    // Don't schedule if already running
    if (this.intervals.has(config.id)) {
      return;
    }

    const intervalMs = config.pollingInterval * 1000;

    // Execute first poll immediately (non-blocking)
    this.executePoll(config.id);

    // Schedule recurring polls
    const interval = setInterval(() => {
      this.executePoll(config.id);
    }, intervalMs);

    this.intervals.set(config.id, interval);
  }

  /**
   * Wraps pollConfig with semaphore acquisition.
   * If the concurrency limit is reached, the poll is queued.
   */
  private executePoll(configId: number): void {
    if (this.activePollCount < this.concurrencyLimit) {
      this.activePollCount++;
      this.runPoll(configId);
    } else {
      // Queue the poll for later execution
      this.pollQueue.push(() => {
        this.activePollCount++;
        this.runPoll(configId);
      });
    }
  }

  /**
   * Runs the poll and releases the semaphore slot when done.
   */
  private runPoll(configId: number): void {
    this.doPoll(configId)
      .catch((error) => {
        this.logger.error(
          `Unexpected error polling config ${configId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      })
      .finally(() => {
        this.releaseSemaphore();
      });
  }

  /**
   * Releases a semaphore slot and processes the next queued poll if any.
   */
  private releaseSemaphore(): void {
    this.activePollCount--;
    if (this.pollQueue.length > 0) {
      const next = this.pollQueue.shift();
      if (next) {
        next();
      }
    }
  }

  /**
   * Core polling flow for a single monitoring-enabled PrtgConfig:
   * 1. Validate PRTG username/passhash settings
   * 2. HTTP GET the monitoring URL (built from sensor ID) with username/passhash params (readonly, Req 12.1)
   * 3. Parse response with MetricParserService.normalize()
   * 4. Classify with AnomalyEngineService.classify()
   * 5. Persist history record via MonitoringHistoryService
   * 6. Evaluate and dispatch alerts via AlertDispatcherService (includes screenshot)
   * 7. Broadcast SSE event via MonitoringEventService
   * 8. Update PrtgConfig.lastPolledAt and lastStatus
   */
  private async doPoll(configId: number): Promise<void> {
    // Guard: prevent concurrent polls for the same config (race condition)
    if (this.pollInProgress.has(configId)) {
      this.logger.debug(
        `Config ${configId}: Poll already in progress, skipping`,
      );
      return;
    }
    this.pollInProgress.add(configId);

    try {
      await this.doPollInternal(configId);
    } finally {
      this.pollInProgress.delete(configId);
    }
  }

  private async doPollInternal(configId: number): Promise<void> {
    // Re-fetch config to get latest state (may have been updated)
    const configRecord = await this.prisma.prtgConfig.findUnique({
      where: { id: configId },
      include: { group: true },
    });

    if (
      !configRecord ||
      !configRecord.enabled ||
      !configRecord.monitoringEnabled ||
      !configRecord.group.enabled
    ) {
      // Config was deleted, disabled, or no longer eligible since scheduling
      this.stopConfig(configId);
      return;
    }

    const config: MonitoringEligibleConfig = {
      id: configRecord.id,
      title: configRecord.title,
      sensorId: configRecord.sensorId,
      groupId: configRecord.groupId,
      pollingInterval: configRecord.pollingInterval,
      thresholdLow: configRecord.thresholdLow,
      thresholdHigh: configRecord.thresholdHigh,
      sensitivity: configRecord.sensitivity,
      cooldownInterval: configRecord.cooldownInterval,
      noTrafficCount: configRecord.noTrafficCount,
      flappingWindow: configRecord.flappingWindow,
      flappingCount: configRecord.flappingCount,
      downCount: configRecord.downCount,
      rollingWindowSize: configRecord.rollingWindowSize,
      notifyDown: configRecord.notifyDown,
      notifyNoTraffic: configRecord.notifyNoTraffic,
      notifyLowTraffic: configRecord.notifyLowTraffic,
      notifyFlapping: configRecord.notifyFlapping,
      notifyRecovery: configRecord.notifyRecovery,
      maintenance: configRecord.maintenance,
      maintenanceLabel: configRecord.maintenanceLabel,
      minTrafficThreshold: configRecord.minTrafficThreshold,
      lastPolledAt: configRecord.lastPolledAt,
      lastStatus: configRecord.lastStatus,
    };

    const previousStatus = config.lastStatus;
    let metric: NormalizedMetric | null = null;
    let errorMessage: string | null = null;

    // Step 1: Validate URL-based username/passhash auth.
    const settings = await this.prtgSetting.getSettingRaw();
    if (!settings.loginUsername || !settings.loginPassword) {
      this.logger.warn(
        `Config ${configId} (${config.title}): PRTG username/passhash is not configured; polling skipped.`,
      );
      return;
    }

    // Step 2: HTTP GET monitoring URL (readonly, Req 12.1, 12.2)
    // Build the monitoring URL from the sensor ID (always includes &username&passhash)
    const pollUrl = await this.buildMonitoringUrl(config.sensorId);
    let rawResponseText: string | null = null;
    try {
      const response = await axios.get(pollUrl, {
        timeout: 30000,
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      // Validate content type — reject HTML responses (e.g. login pages returned as 200)
      const contentType = String(
        response.headers?.['content-type'] ?? '',
      ).toLowerCase();
      if (contentType.includes('text/html')) {
        throw new Error(
          `Unexpected HTML response (content-type: ${contentType}). PRTG may have returned a login page.`,
        );
      }

      const rawText =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);

      // Step 3: Parse response
      metric = this.metricParser.normalize(rawText, configId);

      // Store only the last (most recent) entry for the raw response display
      try {
        const parsed = JSON.parse(rawText);
        const dataArray = parsed.histdata ?? parsed.values;
        if (Array.isArray(dataArray) && dataArray.length > 0) {
          rawResponseText = JSON.stringify(dataArray[dataArray.length - 1]);
        } else {
          rawResponseText = rawText;
        }
      } catch {
        rawResponseText = rawText;
      }

      // Reset consecutive errors on successful fetch + parse
      this.consecutiveErrors.set(configId, 0);
    } catch (error) {
      // HTTP request failed or parser threw MetricParseError
      const currentErrors = (this.consecutiveErrors.get(configId) ?? 0) + 1;
      this.consecutiveErrors.set(configId, currentErrors);

      if (error instanceof MetricParseError) {
        errorMessage = `Parse error: ${error.reason}`;
      } else {
        errorMessage = error instanceof Error ? error.message : String(error);
      }

      this.logger.warn(
        `Config ${configId} (${config.title}): Poll failed (${currentErrors} consecutive errors): ${errorMessage}`,
      );

      // Send HTTP error info to static admin number (not classified as DOWN)
      if (currentErrors === 1) {
        // Only notify on first error to avoid spam
        this.notifyHttpError(config.title, errorMessage ?? 'Unknown error');
      }
    }

    // Step 4: Classify using AnomalyEngine
    const recentHistory = await this.historyService.getRecentByConfig(
      configId,
      Math.max(config.rollingWindowSize, config.noTrafficCount, 20),
    );

    const classification = this.anomalyEngine.classify({
      metric,
      config,
      recentHistory,
      consecutiveErrors: this.consecutiveErrors.get(configId) ?? 0,
    });

    // Step 5: Persist history record
    const now = new Date();

    await this.historyService.persist({
      configId,
      timestamp: metric?.timestamp ?? now,
      status: classification.status,
      totalTrafficBytes: metric?.totalTrafficBytes ?? null,
      totalTrafficBitrate: metric?.totalTrafficBitrate ?? null,
      inboundBytes: metric?.inboundBytes ?? null,
      inboundBitrate: metric?.inboundBitrate ?? null,
      outboundBytes: metric?.outboundBytes ?? null,
      outboundBitrate: metric?.outboundBitrate ?? null,
      errorPercent: metric?.errorPercent ?? null,
      coveragePercent: metric?.coveragePercent ?? null,
      rawInboundBitrate: metric?.inboundBitrate ?? null,
      rawOutboundBitrate: metric?.outboundBitrate ?? null,
      errorMessage,
      rawResponse: rawResponseText,
    });

    // Step 6: Evaluate and dispatch alerts with recovery grace period
    // Build the graph page URL from sensorId for screenshot capture
    // using chart.png as requested by user
    const eventTime = metric?.timestamp ?? now;
    const sdateObj = new Date(eventTime.getTime() - 2 * 60 * 60 * 1000); // 2 hours before
    const edateObj = new Date(eventTime.getTime() + 5 * 60 * 1000); // 5 minutes after
    const formatDateUrl = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

    const requestUrl = `http://prtg.r1net.id/chart.png?id=${config.sensorId}&avg=60&sdate=${formatDateUrl(sdateObj)}&edate=${formatDateUrl(edateObj)}&width=800&height=400&graphstyling=baseFontSize%3D%2712%27%20showLegend%3D%271%27&graphid=-1`;

    // Log status change for debugging
    if (previousStatus !== classification.status) {
      this.logger.log(
        `Config ${configId} (${config.title}): Status changed ${previousStatus} → ${classification.status} | ${classification.reason}`,
      );
    }

    // Recovery grace period logic:
    // - When anomaly → NORMAL: start grace timer, don't notify yet
    // - When NORMAL for 5+ minutes: send recovery notification
    // - When goes back to anomaly within grace period: cancel recovery, suppress re-alert
    const isRecovering = this.recoveryStartedAt.has(configId);

    // Skip all notifications if config is in maintenance mode
    if (config.maintenance) {
      this.logger.debug(
        `Config ${configId} (${config.title}): Maintenance mode — notifications suppressed`,
      );
      // Still clear recovery state if needed
      if (isRecovering && classification.status !== NocStatus.NORMAL) {
        this.recoveryStartedAt.delete(configId);
      }
    } else if (
      previousStatus !== NocStatus.NORMAL &&
      classification.status === NocStatus.NORMAL &&
      !isRecovering
    ) {
      // Just became NORMAL — start grace period
      this.recoveryStartedAt.set(configId, now);
      this.logger.debug(
        `Config ${configId}: Recovery grace period started (10 min)`,
      );
      // Don't dispatch anything yet
    } else if (isRecovering && classification.status === NocStatus.NORMAL) {
      // Still NORMAL during grace period — check if 5 minutes passed
      const recoveryStart = this.recoveryStartedAt.get(configId)!;
      if (now.getTime() - recoveryStart.getTime() >= this.RECOVERY_GRACE_MS) {
        // Grace period passed — send recovery notification (if enabled)
        this.recoveryStartedAt.delete(configId);
        this.lastNotifiedAt.delete(configId);
        this.lastNotifiedStatus.delete(configId);

        if (this.isNotifyEnabledForStatus(NocStatus.NORMAL, config)) {
          await this.dispatcher.dispatch({
            configId: config.id,
            title: config.title,
            requestUrl,
            previousStatus: NocStatus.DOWN,
            currentStatus: NocStatus.NORMAL,
            bitrate: metric?.totalTrafficBitrate ?? null,
            inboundBitrate: metric?.inboundBitrate ?? null,
            outboundBitrate: metric?.outboundBitrate ?? null,
            timestamp: now,
            reason: 'Stabil selama 5 menit',
            lastNotifiedAt: null,
            cooldownInterval: config.cooldownInterval,
            groupId: config.groupId,
            groupName: configRecord.group.name,
          });
          this.logger.log(
            `Config ${configId} (${config.title}): Recovery confirmed after 10 min grace period`,
          );
        } else {
          this.logger.debug(
            `Config ${configId} (${config.title}): Recovery notification disabled, skipping dispatch`,
          );
        }
      }
    } else if (isRecovering && classification.status !== NocStatus.NORMAL) {
      // Went back to anomaly during grace period — cancel recovery
      // Sensor sempat NORMAL sebentar tapi kembali anomaly sebelum grace period selesai
      this.recoveryStartedAt.delete(configId);
      this.logger.log(
        `Config ${configId}: Recovery cancelled — back to ${classification.status}`,
      );

      if (this.isNotifyEnabledForStatus(classification.status, config)) {
        // Always send immediately when sensor goes back to anomaly after brief NORMAL
        // This covers: NORMAL→DOWN→(brief NORMAL)→DOWN = kirim langsung
        // The 1-hour cooldown only applies to escalation (e.g., LOW_TRAFFIC→DOWN without NORMAL in between)
        await this.dispatcher.dispatch({
          configId: config.id,
          title: config.title,
          requestUrl,
          previousStatus: NocStatus.NORMAL,
          currentStatus: classification.status,
          bitrate: metric?.totalTrafficBitrate ?? null,
          inboundBitrate: metric?.inboundBitrate ?? null,
          outboundBitrate: metric?.outboundBitrate ?? null,
          timestamp: now,
          reason: classification.reason,
          lastNotifiedAt: null,
          cooldownInterval: 0,
          groupId: config.groupId,
          groupName: configRecord.group.name,
        });
        this.lastNotifiedAt.set(configId, now);
        this.lastNotifiedStatus.set(configId, classification.status);
      } else {
        this.logger.debug(
          `Config ${configId}: Notification for ${classification.status} disabled, skipping dispatch`,
        );
      }
    } else if (!isRecovering && classification.status !== NocStatus.NORMAL) {
      if (this.isNotifyEnabledForStatus(classification.status, config)) {
        const isFirstTransition = previousStatus === NocStatus.NORMAL;

        const isWorsening =
          previousStatus === NocStatus.LOW_TRAFFIC &&
          (classification.status === NocStatus.DOWN ||
            classification.status === NocStatus.NO_TRAFFIC);
        const isPartialRecovery =
          (previousStatus === NocStatus.DOWN ||
            previousStatus === NocStatus.NO_TRAFFIC) &&
          classification.status === NocStatus.LOW_TRAFFIC;

        const isOtherEscalation =
          previousStatus !== classification.status &&
          !isWorsening &&
          !isPartialRecovery &&
          !isFirstTransition;

        if (isFirstTransition || isWorsening) {
          // First time anomaly or worsening (LOW_TRAFFIC -> DOWN) — send immediately!
          const dispatchResult = await this.dispatcher.dispatch({
            configId: config.id,
            title: config.title,
            requestUrl,
            previousStatus,
            currentStatus: classification.status,
            bitrate: metric?.totalTrafficBitrate ?? null,
            inboundBitrate: metric?.inboundBitrate ?? null,
            outboundBitrate: metric?.outboundBitrate ?? null,
            timestamp: now,
            reason: classification.reason,
            lastNotifiedAt: null,
            cooldownInterval: 0,
            groupId: config.groupId,
            groupName: configRecord.group.name,
          });

          if (dispatchResult.shouldNotify) {
            this.lastNotifiedAt.set(configId, now);
            this.lastNotifiedStatus.set(configId, classification.status);
          }
        } else if (isPartialRecovery) {
          // Partial recovery (DOWN -> LOW_TRAFFIC) — suppress notification
          // We update lastNotifiedStatus, but keep lastNotifiedAt so DOWN 1-hour cooldown persists
          this.logger.debug(
            `Config ${configId} (${config.title}): Partial recovery ${previousStatus}→${classification.status} suppressed`,
          );
          this.lastNotifiedStatus.set(configId, classification.status);
        } else if (isOtherEscalation) {
          // Other status escalation — apply 1-hour cooldown
          const lastNotified = this.lastNotifiedAt.get(configId);
          const cooldownElapsed =
            !lastNotified ||
            now.getTime() - lastNotified.getTime() >=
              this.ESCALATION_COOLDOWN_MS;

          if (cooldownElapsed) {
            const dispatchResult = await this.dispatcher.dispatch({
              configId: config.id,
              title: config.title,
              requestUrl,
              previousStatus,
              currentStatus: classification.status,
              bitrate: metric?.totalTrafficBitrate ?? null,
              inboundBitrate: metric?.inboundBitrate ?? null,
              outboundBitrate: metric?.outboundBitrate ?? null,
              timestamp: now,
              reason: classification.reason,
              lastNotifiedAt: lastNotified ?? null,
              cooldownInterval: this.ESCALATION_COOLDOWN_MS / 1000,
              groupId: config.groupId,
              groupName: configRecord.group.name,
            });

            if (dispatchResult.shouldNotify) {
              this.lastNotifiedAt.set(configId, now);
              this.lastNotifiedStatus.set(configId, classification.status);
            }
          } else {
            const remainingMin = Math.ceil(
              (this.ESCALATION_COOLDOWN_MS -
                (now.getTime() - lastNotified.getTime())) /
                60000,
            );
            this.logger.debug(
              `Config ${configId} (${config.title}): Escalation ${previousStatus}→${classification.status} suppressed (cooldown ${remainingMin} min remaining)`,
            );
          }
        } else {
          // Same anomaly status as before (e.g., DOWN → DOWN)
          // Re-send notification every 1 hour if still DOWN
          const lastNotified = this.lastNotifiedAt.get(configId);
          if (
            classification.status === NocStatus.DOWN &&
            lastNotified &&
            now.getTime() - lastNotified.getTime() >=
              this.PERSISTENT_DOWN_RENOTIFY_MS
          ) {
            const dispatchResult = await this.dispatcher.dispatch({
              configId: config.id,
              title: config.title,
              requestUrl,
              previousStatus,
              currentStatus: classification.status,
              bitrate: metric?.totalTrafficBitrate ?? null,
              inboundBitrate: metric?.inboundBitrate ?? null,
              outboundBitrate: metric?.outboundBitrate ?? null,
              timestamp: now,
              reason: `Masih DOWN selama ${Math.round((now.getTime() - lastNotified.getTime()) / 60000)} menit`,
              lastNotifiedAt: lastNotified,
              cooldownInterval: this.PERSISTENT_DOWN_RENOTIFY_MS / 1000,
              groupId: config.groupId,
              groupName: configRecord.group.name,
            });

            if (dispatchResult.shouldNotify) {
              this.lastNotifiedAt.set(configId, now);
            }
          } else {
            this.logger.debug(
              `Config ${configId} (${config.title}): Still ${classification.status}, suppressing duplicate notification`,
            );
          }
        }
      } else {
        this.logger.debug(
          `Config ${configId}: Notification for ${classification.status} disabled, skipping dispatch`,
        );
      }
    }

    // Step 7: Broadcast SSE event
    // If notifyLowTraffic is disabled, broadcast LOW_TRAFFIC as NORMAL for display purposes
    const displayStatus =
      classification.status === NocStatus.LOW_TRAFFIC &&
      !config.notifyLowTraffic
        ? NocStatus.NORMAL
        : classification.status;
    const displayPreviousStatus =
      previousStatus === NocStatus.LOW_TRAFFIC && !config.notifyLowTraffic
        ? NocStatus.NORMAL
        : previousStatus;

    this.eventService.emit({
      type: 'status_change',
      configId: config.id,
      configTitle: config.title,
      groupName: configRecord.group.name,
      previousStatus: displayPreviousStatus,
      currentStatus: displayStatus,
      timestamp: now.toISOString(),
      maintenance: config.maintenance,
      metric: metric
        ? {
            totalTrafficBitrate: metric.totalTrafficBitrate,
            inboundBitrate: metric.inboundBitrate,
            outboundBitrate: metric.outboundBitrate,
          }
        : null,
    });

    // Step 8: Update PrtgConfig.lastPolledAt and lastStatus
    await this.prisma.prtgConfig.update({
      where: { id: configId },
      data: {
        lastPolledAt: now,
        lastStatus: classification.status,
      },
    });
  }

  /**
   * Sends HTTP error notification to the static admin number.
   * This is NOT a DOWN classification — just an info that PRTG is unreachable.
   * Logs the error for now — actual WhatsApp send is handled via the dispatcher.
   */
  private notifyHttpError(configTitle: string, errorMessage: string): void {
    this.logger.warn(
      `[HTTP ERROR] Config "${configTitle}" — PRTG unreachable: ${errorMessage}. ` +
        `Notifikasi akan dikirim ke admin jika berlanjut.`,
    );
  }

  /**
   * Builds the monitoring URL from a sensor ID using the PRTG base URL from settings.
   * Uses sdate/edate for a recent time window to get raw per-minute data.
   * The usecaption=1 parameter returns named keys (Traffic Total, Traffic In, etc.)
   * instead of the aggregated graph format.
   */
  private async buildMonitoringUrl(sensorId: number): Promise<string> {
    const settings = await this.prtgSetting.getSettingRaw();
    const baseUrl = new URL(settings.loginUrl);

    // Request last 5 minutes of data — PRTG has ~2 min processing delay
    // so the most recent entry will be ~2-3 min old, which is acceptable
    const now = new Date();
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000);

    const formatDate = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}-${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}-${String(d.getSeconds()).padStart(2, '0')}`;

    const sdate = formatDate(fiveMinAgo);
    const edate = formatDate(now);

    let url = `${baseUrl.protocol}//${baseUrl.host}/api/historicdata.json?id=${sensorId}&avg=0&sdate=${sdate}&edate=${edate}&usecaption=1`;

    url += `&username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;

    return url;
  }

  /**
   * Checks if notification is enabled for the given status based on per-config switches.
   * Returns true if the notification should be sent, false if it should be suppressed.
   */
  private isNotifyEnabledForStatus(
    status: NocStatus,
    config: {
      notifyDown: boolean;
      notifyNoTraffic: boolean;
      notifyLowTraffic: boolean;
      notifyFlapping: boolean;
      notifyRecovery: boolean;
    },
  ): boolean {
    switch (status) {
      case NocStatus.DOWN:
      case NocStatus.NO_TRAFFIC: // Same as DOWN (merged)
        return config.notifyDown;
      case NocStatus.LOW_TRAFFIC:
        return config.notifyLowTraffic;
      case NocStatus.POSSIBLE_FLAPPING:
        return config.notifyFlapping;
      case NocStatus.NORMAL:
        return config.notifyRecovery;
      default:
        return true;
    }
  }
}
