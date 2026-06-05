import { execFile } from 'child_process';
import * as net from 'net';
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
export class PingMonitorSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PingMonitorSchedulerService.name);
  private readonly timers = new Map<number, NodeJS.Timeout>();
  private readonly signatures = new Map<number, string>();
  private readonly running = new Set<number>();
  private syncTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsappSenderService,
    private readonly events: MonitoringEventService,
  ) {}

  async onModuleInit() {
    await this.sync();
    this.syncTimer = setInterval(() => void this.sync(), 15000);
  }

  onModuleDestroy() {
    if (this.syncTimer) clearInterval(this.syncTimer);
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
    this.logger.log(`Ping monitoring started for ${monitor.name} (${monitor.host})`);
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
      const result = await this.executePing(monitor.host, monitor.pingTimeoutSeconds);
      await this.applyResult(monitor, result);
    } catch (error) {
      this.logger.error(
        `Ping monitor ${monitor.id} failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      this.running.delete(monitor.id);
    }
  }

  private executePing(host: string, timeoutSeconds: number): Promise<PingResult> {
    const timeoutMs = timeoutSeconds * 1000;
    const isWindows = process.platform === 'win32';

    if (isWindows) {
      const args = ['-n', '1', '-w', String(timeoutMs), host];
      return new Promise((resolve) => {
        execFile('ping', args, { timeout: timeoutMs + 1500 }, (error, stdout) => {
          const text = String(stdout ?? '');
          const match = text.match(/time[=<]\s*([\d.]+)\s*ms/i);
          resolve({
            reachable: !error && Boolean(match),
            latencyMs: match ? Number(match[1]) : null,
          });
        });
      });
    }

    // On Linux/macOS (e.g. Heroku), parse the host and port
    let targetHost = host;
    let targetPort: number | null = null;

    if (host.includes('[')) {
      const match = host.match(/^\[(.*)\]:(\d+)$/);
      if (match) {
        targetHost = match[1];
        targetPort = parseInt(match[2], 10);
      } else {
        targetHost = host.replace(/[\[\]]/g, '');
      }
    } else {
      const parts = host.split(':');
      if (parts.length === 2) {
        targetHost = parts[0];
        targetPort = parseInt(parts[1], 10);
      }
    }

    // If port is explicitly specified, use TCP ping directly
    if (targetPort !== null) {
      return this.tcpPing(targetHost, targetPort, timeoutMs);
    }

    // Otherwise, try standard ICMP ping, and if it fails due to permissions, fall back to TCP ping on port 80
    const args = ['-c', '1', '-W', String(timeoutSeconds), host];
    return new Promise((resolve) => {
      execFile('ping', args, { timeout: timeoutMs + 1500 }, (error, stdout, stderr) => {
        const text = String(stdout ?? '');
        const errText = String(stderr ?? '');
        
        const isPermissionError =
          errText.includes('Operation not permitted') ||
          errText.includes('Permission denied') ||
          text.includes('Operation not permitted') ||
          text.includes('Permission denied') ||
          (error && (error as any).code === 'EACCES');

        if (isPermissionError) {
          this.logger.debug(
            `ICMP ping to ${host} failed due to platform restrictions (Operation not permitted). Falling back to TCP ping on port 80.`,
          );
          resolve(this.tcpPing(targetHost, 80, timeoutMs));
        } else {
          const match = text.match(/time[=<]\s*([\d.]+)\s*ms/i);
          resolve({
            reachable: !error && Boolean(match),
            latencyMs: match ? Number(match[1]) : null,
          });
        }
      });
    });
  }

  private tcpPing(host: string, port: number, timeoutMs: number): Promise<PingResult> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      const startTime = process.hrtime();
      let resolved = false;

      const done = (reachable: boolean) => {
        if (resolved) return;
        resolved = true;
        socket.destroy();
        const diff = process.hrtime(startTime);
        const latencyMs = (diff[0] * 1e9 + diff[1]) / 1e6;
        resolve({
          reachable,
          latencyMs: reachable ? latencyMs : null,
        });
      };

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        done(true);
      });

      socket.on('timeout', () => {
        done(false);
      });

      socket.on('error', (err: any) => {
        // ECONNREFUSED means the host is online and responded with RST, so it is reachable
        if (err.code === 'ECONNREFUSED') {
          done(true);
        } else {
          done(false);
        }
      });

      socket.connect(port, host);
    });
  }

  private async applyResult(monitor: PingMonitor, result: PingResult) {
    const now = new Date();
    let status = monitor.status;
    let outageStartedAt = monitor.outageStartedAt;
    let lastAlertAt = monitor.lastAlertAt;

    if (result.reachable) {
      const recovered = monitor.status === 'RTO';
      status = 'UP';
      outageStartedAt = null;
      if (recovered && monitor.notifyRecovery && !monitor.maintenance) {
        await this.notify(monitor, monitor.recoveryTemplate, result.latencyMs, now, monitor.outageStartedAt);
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
          await this.notify(monitor, monitor.alertTemplate, null, now, outageStartedAt);
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
          ? Math.max(0, Math.floor((now.getTime() - outageStartedAt.getTime()) / 1000))
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
      (text, [key, value]) => text.replace(new RegExp(`\\{${key}\\}`, 'g'), value),
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
