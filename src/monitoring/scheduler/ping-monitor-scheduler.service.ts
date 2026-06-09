import * as ping from 'ping';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import type { PingMonitor, RecipientTargetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappSenderService } from '../../whatsapp/whatsapp-sender.service';
import { MonitoringEventService } from './monitoring-event.service';

interface PingResult {
  reachable: boolean;
  latencyMs: number | null;
}

@Injectable()
export class PingMonitorSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PingMonitorSchedulerService.name);
  private readonly timers = new Map<number, NodeJS.Timeout>();
  private readonly signatures = new Map<number, string>();
  private readonly running = new Set<number>();
  private syncTimer: NodeJS.Timeout | null = null;
  private logCleanupTimer: NodeJS.Timeout | null = null;
  private readonly logFilePath = path.join(process.cwd(), 'temp', 'ping.log');

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsappSenderService,
    private readonly events: MonitoringEventService,
  ) {}

  async onModuleInit() {
    const dir = path.dirname(this.logFilePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await this.sync();
    this.syncTimer = setInterval(() => void this.sync(), 15000);
    this.logCleanupTimer = setInterval(
      () => void this.cleanupLogs(),
      60 * 60 * 1000,
    ); // 1 hour
    void this.cleanupLogs();
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
    if (this.logCleanupTimer) clearInterval(this.logCleanupTimer);
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
  }

  async sync() {
    let monitors: PingMonitor[] = [];
    try {
      monitors = await this.prisma.pingMonitor.findMany({
        where: { enabled: true },
      });
    } catch (error) {
      if (this.isMissingPingTable(error)) {
        this.logger.warn(
          'PingMonitor table is not ready yet; ping scheduler will retry after database bootstrap.',
        );
        return;
      }
      throw error;
    }
    const ids = new Set(monitors.map((monitor) => monitor.id));

    for (const [id, timer] of this.timers) {
      if (!ids.has(id)) {
        clearInterval(timer);
        this.timers.delete(id);
        this.signatures.delete(id);
      }
    }
    for (const monitor of monitors) {
      const signature = this.signature(monitor);
      if (this.signatures.get(monitor.id) !== signature) {
        const current = this.timers.get(monitor.id);
        if (current) clearInterval(current);
        this.timers.delete(monitor.id);
        this.schedule(monitor);
      }
    }
  }

  private isMissingPingTable(error: unknown) {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      ['P1001', 'P2021'].includes((error as { code?: string }).code ?? '')
    );
  }

  async pollNow(id: number) {
    const monitor = await this.prisma.pingMonitor.findUnique({ where: { id } });
    if (!monitor) return false;
    await this.poll(monitor);
    return true;
  }

  private schedule(monitor: PingMonitor) {
    void this.poll(monitor);
    const timer = setInterval(
      () => void this.pollById(monitor.id),
      monitor.intervalSeconds * 1000,
    );
    this.timers.set(monitor.id, timer);
    this.signatures.set(monitor.id, this.signature(monitor));
    this.logger.log(
      `Ping monitoring started for ${monitor.name} (${monitor.host})`,
    );
  }

  private signature(monitor: PingMonitor) {
    return [
      monitor.host,
      monitor.intervalSeconds,
      monitor.pingTimeoutSeconds,
      monitor.rtoThresholdSeconds,
      monitor.notificationCooldownSeconds,
      monitor.maintenance,
      monitor.enabled,
    ].join(':');
  }

  private async pollById(id: number) {
    const monitor = await this.prisma.pingMonitor.findUnique({ where: { id } });
    if (!monitor?.enabled) return;
    await this.poll(monitor);
  }

  private async poll(monitor: PingMonitor) {
    if (this.running.has(monitor.id)) return;
    this.running.add(monitor.id);
    try {
      const result = await this.executeCheck(
        monitor.host,
        monitor.pingTimeoutSeconds,
      );
      await this.applyResult(monitor, result);
    } catch (error) {
      this.logger.error(
        `Ping monitor ${monitor.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running.delete(monitor.id);
    }
  }

  private async executeCheck(
    host: string,
    timeoutSeconds: number,
  ): Promise<PingResult> {
    // Hapus protokol http/https dan path jika pengguna memasukkan URL, karena ICMP ping hanya menerima hostname/IP
    const cleanHost = host
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0];

    try {
      const res = await ping.promise.probe(cleanHost, {
        timeout: timeoutSeconds,
      });
      return {
        reachable: res.alive,
        latencyMs:
          res.alive && typeof res.time === 'number'
            ? Math.round(res.time)
            : null,
      };
    } catch (error) {
      this.logger.debug(`ICMP check to ${cleanHost} failed: ${error}`);
      return { reachable: false, latencyMs: null };
    }
  }

  private appendPingLog(monitor: PingMonitor, result: PingResult) {
    const now = new Date();
    const status = result.reachable ? 'UP' : 'RTO';
    const latency = result.latencyMs !== null ? `${result.latencyMs}ms` : 'N/A';
    const line = `${now.toISOString()} | ${monitor.name} | ${monitor.host} | ${status} | ${latency}\n`;
    fs.appendFile(this.logFilePath, line, (err) => {
      if (err) this.logger.error(`Failed to write ping log: ${err}`);
    });

    // Broadcast to SSE clients
    this.events.emitPingLog({
      type: 'ping_log',
      timestamp: now.toISOString(),
      name: monitor.name,
      host: monitor.host,
      status,
      latencyMs: latency,
    });
  }

  private async cleanupLogs() {
    if (!fs.existsSync(this.logFilePath)) return;

    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const tempFile = `${this.logFilePath}.tmp`;

    try {
      const rl = readline.createInterface({
        input: fs.createReadStream(this.logFilePath),
        crlfDelay: Infinity,
      });

      const writeStream = fs.createWriteStream(tempFile);

      for await (const line of rl) {
        const parts = line.split(' | ');
        if (parts.length > 0) {
          const timestamp = new Date(parts[0]);
          if (timestamp >= cutoffDate) {
            writeStream.write(line + '\n');
          }
        }
      }

      writeStream.end();

      await new Promise((resolve) => writeStream.on('finish', resolve));
      fs.renameSync(tempFile, this.logFilePath);
    } catch (error) {
      this.logger.error(`Error during ping log cleanup: ${error}`);
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
    }
  }

  private async applyResult(monitor: PingMonitor, result: PingResult) {
    this.appendPingLog(monitor, result);
    const now = new Date();
    let status = monitor.status;
    let outageStartedAt = monitor.outageStartedAt;
    let lastAlertAt = monitor.lastAlertAt;

    if (result.reachable) {
      const recovered = monitor.status === 'RTO';
      status = 'UP';
      outageStartedAt = null;
      if (recovered && monitor.notifyRecovery && !monitor.maintenance) {
        await this.notify(
          monitor,
          monitor.recoveryTemplate,
          result.latencyMs,
          now,
          monitor.outageStartedAt,
        );
      }
    } else {
      outageStartedAt ??= now;
      const outageMs = now.getTime() - outageStartedAt.getTime();
      if (outageMs >= monitor.rtoThresholdSeconds * 1000) {
        status = 'RTO';
        const cooldownPassed =
          !monitor.lastAlertAt ||
          now.getTime() - monitor.lastAlertAt.getTime() >=
            monitor.notificationCooldownSeconds * 1000;
        if (!monitor.maintenance && cooldownPassed) {
          await this.notify(
            monitor,
            monitor.alertTemplate,
            null,
            now,
            outageStartedAt,
          );
          lastAlertAt = now;
        }
      }
    }

    const updated = await this.prisma.pingMonitor.update({
      where: { id: monitor.id },
      data: {
        status,
        lastLatencyMs: result.reachable ? result.latencyMs : null,
        lastCheckedAt: now,
        outageStartedAt,
        lastAlertAt,
      },
    });

    this.events.emitPing({
      type: 'ping_status',
      monitorId: updated.id,
      name: updated.name,
      host: updated.host,
      status: updated.status,
      latencyMs: updated.lastLatencyMs,
      checkedAt: now.toISOString(),
      outageStartedAt: updated.outageStartedAt?.toISOString() ?? null,
      maintenance: updated.maintenance,
      maintenanceLabel: updated.maintenanceLabel,
    });
  }

  private async notify(
    monitor: PingMonitor,
    template: string,
    latencyMs: number | null,
    now: Date,
    outageStartedAt: Date | null,
  ) {
    const assigned = await this.prisma.pingMonitorRecipient.findMany({
      where: { pingMonitorId: monitor.id, pingRecipient: { enabled: true } },
      include: { pingRecipient: true },
    });
    const recipients = assigned.length
      ? assigned.map((item) => item.pingRecipient)
      : await this.prisma.pingRecipient.findMany({
          where: { enabled: true },
        });

    const message = this.renderTemplate(template, {
      label: monitor.name,
      host: monitor.host,
      latencyMs: latencyMs === null ? 'RTO' : latencyMs.toFixed(1),
      outageSeconds: String(
        outageStartedAt
          ? Math.max(
              0,
              Math.floor((now.getTime() - outageStartedAt.getTime()) / 1000),
            )
          : 0,
      ),
      time: now.toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }),
      status: latencyMs === null ? 'RTO' : 'UP',
    });

    for (const recipient of recipients) {
      const jid = this.buildJid(recipient.phoneNumber, recipient.targetType);
      if (!jid) continue;
      try {
        await this.whatsappSender.sendTextToJid(jid, message);
      } catch (error) {
        this.logger.error(
          `Failed sending ping alert to ${jid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private renderTemplate(template: string, values: Record<string, string>) {
    return Object.entries(values).reduce(
      (text, [key, value]) =>
        text.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
      template,
    );
  }

  private buildJid(phoneNumber: string, targetType: RecipientTargetType) {
    const value = phoneNumber.trim();
    if (value.includes('@')) return value;
    const number = value.replace(/\D/g, '');
    if (!number) return null;
    if (targetType === 'group') return `${number}@g.us`;
    if (targetType === 'channel') return `${number}@newsletter`;
    return `${number}@s.whatsapp.net`;
  }
}
