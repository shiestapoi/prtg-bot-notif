/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-require-imports, @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import { TelegramSenderService } from '../telegram/telegram-sender.service';
import { ScreenshotService } from '../monitoring/dispatcher/screenshot.service';
import { R2StorageService } from '../storage/r2-storage.service';
import { PdfGeneratorService } from './pdf-generator.service';
import {
  ReceiptPeriod,
  NocStatus,
  ScheduleTargetMode,
  ReceiptSchedule,
  PrtgConfig,
} from '@prisma/client';
import { ReceiptDispatchSummary } from './receipt-report.types';

@Injectable()
export class ReceiptReportService {
  private readonly logger = new Logger(ReceiptReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSenderService: WhatsappSenderService,
    private readonly telegramSenderService: TelegramSenderService,
    private readonly screenshotService: ScreenshotService,
    private readonly r2StorageService: R2StorageService,
    private readonly pdfGeneratorService: PdfGeneratorService,
  ) {}

  async dispatchSchedule(
    schedule: ReceiptSchedule & { group: { id: number; name: string } | null },
  ): Promise<ReceiptDispatchSummary> {
    const startDate = this.getStartDate(schedule.period);

    // 1. Get configs matching the schedule's group (or all if null)
    const configs = await this.prisma.prtgConfig.findMany({
      where: schedule.groupId
        ? { groupId: schedule.groupId, enabled: true, maintenance: false }
        : { enabled: true, maintenance: false },
      include: { group: true },
    });

    if (configs.length === 0) {
      return this.buildSummary(schedule, 0, 0, true);
    }

    // 2. Query history for these configs within the period
    const configIds = configs.map((c) => c.id);
    const histories = await this.prisma.monitoringHistory.findMany({
      where: {
        configId: { in: configIds },
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'asc' }, // Ascending to detect state transitions
    });

    // 3. Process incidents per config
    // We detect transitions into DOWN or LOW_TRAFFIC
    type Incident = {
      status: NocStatus;
      time: Date;
      recoveryTime?: Date;
      inboundBefore?: number | null;
      outboundBefore?: number | null;
      inboundDuring?: number | null;
      outboundDuring?: number | null;
    };
    const incidentsByConfig = new Map<number, Incident[]>();

    // Pass 1: Compute global average over the entire period for each config
    const periodAverages = new Map<
      number,
      { avgIn: number | null; avgOut: number | null }
    >();
    for (const configId of configIds) {
      const validHistories = histories.filter(
        (h) => h.configId === configId && h.inboundBitrate !== null,
      );
      if (validHistories.length > 0) {
        const sumIn = validHistories.reduce(
          (acc, h) => acc + h.inboundBitrate!,
          0,
        );
        const sumOut = validHistories.reduce(
          (acc, h) => acc + h.outboundBitrate!,
          0,
        );
        periodAverages.set(configId, {
          avgIn: sumIn / validHistories.length,
          avgOut: sumOut / validHistories.length,
        });
      } else {
        periodAverages.set(configId, { avgIn: null, avgOut: null });
      }
    }

    // Track previous state to detect transitions
    const previousState = new Map<
      number,
      { status: NocStatus; inbound: number | null; outbound: number | null }
    >();

    for (const history of histories) {
      const config = configs.find((c) => c.id === history.configId);

      const currentStatus = history.status;

      const prev = previousState.get(history.configId) || {
        status: NocStatus.NORMAL,
        inbound: null,
        outbound: null,
      };

      if (currentStatus !== prev.status) {
        // ALWAYS close the previous incident on any state transition
        const configIncidents = incidentsByConfig.get(history.configId);
        if (configIncidents && configIncidents.length > 0) {
          const lastIncident = configIncidents[configIncidents.length - 1];
          if (!lastIncident.recoveryTime) {
            lastIncident.recoveryTime = history.timestamp;
          }
        }

        // Get global average for LOW_TRAFFIC
        const averages = periodAverages.get(history.configId);

        // We ALWAYS capture DOWN and LOW_TRAFFIC for the web view snapshot
        if (
          currentStatus === NocStatus.DOWN ||
          currentStatus === NocStatus.LOW_TRAFFIC
        ) {
          let lastSameStatusIncidentIdx = -1;
          if (configIncidents) {
            for (let i = configIncidents.length - 1; i >= 0; i--) {
              if (configIncidents[i].status === currentStatus) {
                lastSameStatusIncidentIdx = i;
                break;
              }
            }
          }

          let merged = false;
          if (lastSameStatusIncidentIdx !== -1) {
            const lastSameStatus = configIncidents![lastSameStatusIncidentIdx];
            const compareTime =
              lastSameStatus.recoveryTime || lastSameStatus.time;
            if (
              history.timestamp.getTime() - compareTime.getTime() <
              60 * 60 * 1000
            ) {
              // Flapping! Merge by reopening the previous incident of the same status
              lastSameStatus.recoveryTime = undefined;
              lastSameStatus.inboundDuring = history.inboundBitrate;
              lastSameStatus.outboundDuring = history.outboundBitrate;

              // Remove any intermediate short-lived incidents (e.g. LOW_TRAFFIC) between the flaps
              configIncidents!.splice(lastSameStatusIncidentIdx + 1);
              merged = true;
            }
          }

          if (!merged) {
            if (!incidentsByConfig.has(history.configId)) {
              incidentsByConfig.set(history.configId, []);
            }
            incidentsByConfig.get(history.configId)!.push({
              status: currentStatus,
              time: history.timestamp,
              inboundBefore:
                currentStatus === NocStatus.LOW_TRAFFIC
                  ? (averages?.avgIn ?? prev.inbound)
                  : prev.inbound,
              outboundBefore:
                currentStatus === NocStatus.LOW_TRAFFIC
                  ? (averages?.avgOut ?? prev.outbound)
                  : prev.outbound,
              inboundDuring: history.inboundBitrate,
              outboundDuring: history.outboundBitrate,
            });
          }
        }
      }

      // Update previous state
      previousState.set(history.configId, {
        status: currentStatus,
        inbound:
          history.inboundBitrate !== null
            ? history.inboundBitrate
            : prev.inbound,
        outbound:
          history.outboundBitrate !== null
            ? history.outboundBitrate
            : prev.outbound,
      });
    }

    let totalIncidentsFound = 0;
    for (const incidents of incidentsByConfig.values()) {
      totalIncidentsFound += incidents.length;
    }

    // 4. If no incidents found, skip sending
    if (totalIncidentsFound === 0) {
      this.logger.log(
        `ReceiptSchedule ${schedule.name} skipped: No matching incidents found.`,
      );
      return this.buildSummary(schedule, 0, 0, true);
    }

    // 5. Build and send messages
    const settings = await this.prisma.prtgSetting.findFirst();
    const template =
      settings?.receiptMessageTemplate ||
      '*{title}*\nGROUP : {groupName}\n{details}';

    let sentCount = 0;

    // Construct Title
    const periodText =
      schedule.period === 'DAILY'
        ? 'HARIAN'
        : schedule.period === 'WEEKLY'
          ? 'MINGGUAN'
          : 'BULANAN';
    let fullMessage = `*LAPORAN ${periodText} BW*\n====================\n`;

    const configMessages: string[] = [];
    const reportDataPayload: any[] = [];

    for (const [configId, incidents] of incidentsByConfig.entries()) {
      if (incidents.length === 0) continue;

      const config = configs.find((c) => c.id === configId);
      if (!config) continue;

      const downCount = incidents.filter(
        (i) => i.status === NocStatus.DOWN,
      ).length;
      const lowTrafficCount = incidents.filter(
        (i) => i.status === NocStatus.LOW_TRAFFIC,
      ).length;

      // Add to snapshot payload (includes ALL DOWN and LOW TRAFFIC regardless of schedule settings)
      reportDataPayload.push({
        configId: config.id,
        title: config.title,
        groupName: config.group?.name || 'N/A',
        sensorId: config.sensorId,
        downCount,
        lowTrafficCount,
        incidents: incidents.map((i) => {
          const sdateObj = new Date(i.time.getTime() - 30 * 60 * 1000); // 30 minutes before
          const recoveryObj = i.recoveryTime || new Date();
          const edateObj = new Date(recoveryObj.getTime() + 30 * 60 * 1000); // 30 minutes after recovery

          return {
            status: i.status,
            time: i.time.toISOString(),
            recoveryTime: i.recoveryTime ? i.recoveryTime.toISOString() : null,
            formattedTime: `${this.formatTimeWib(i.time)} WIB`,
            inboundBefore: i.inboundBefore,
            inboundDuring: i.inboundDuring,
            outboundBefore: i.outboundBefore,
            outboundDuring: i.outboundDuring,
            threshold:
              i.status === NocStatus.LOW_TRAFFIC
                ? config.thresholdLow
                : config.downThreshold,
            sdate: this.formatPrtgDate(sdateObj),
            edate: this.formatPrtgDate(edateObj),
          };
        }),
      });

      // Filter for WhatsApp based on schedule settings
      const waDownCount = schedule.includeDown ? downCount : 0;
      const waLowTrafficCount = schedule.includeLowTraffic
        ? lowTrafficCount
        : 0;

      if (waDownCount === 0 && waLowTrafficCount === 0) continue;

      let detailsStr = '';
      if (waDownCount > 0) {
        detailsStr += `DOWN : ${waDownCount}x\ndijam :\n`;
        incidents
          .filter((i) => i.status === NocStatus.DOWN)
          .forEach((i) => {
            detailsStr += `- ${this.formatTimeWib(i.time)} WIB\n`;
          });
      }
      if (waLowTrafficCount > 0) {
        if (detailsStr) detailsStr += '\n';
        detailsStr += `LOW TRAFFIC : ${waLowTrafficCount}x\ndijam :\n`;
        incidents
          .filter((i) => i.status === NocStatus.LOW_TRAFFIC)
          .forEach((i) => {
            detailsStr += `- ${this.formatTimeWib(i.time)} WIB\n`;
          });
      }

      const configMsg = template
        .replace(/{title}/g, config.title)
        .replace(/{groupName}/g, config.group?.name || 'N/A')
        .replace(/{details}/g, detailsStr.trim());

      configMessages.push(configMsg);
    }

    let snapshotId = '';
    const existingSnapshot = await this.prisma.receiptReportSnapshot.findFirst({
      where: {
        period: schedule.period,
        groupName: schedule.group?.name ?? null,
        startDate: startDate,
      },
    });

    if (existingSnapshot) {
      snapshotId = existingSnapshot.id;
      await this.prisma.receiptReportSnapshot.update({
        where: { id: existingSnapshot.id },
        data: {
          endDate: new Date(),
          reportData: reportDataPayload,
        },
      });
    } else {
      const crypto = require('crypto');
      snapshotId = crypto.randomBytes(5).toString('hex');
      await this.prisma.receiptReportSnapshot.create({
        data: {
          id: snapshotId,
          scheduleId: schedule.id === 0 ? null : schedule.id,
          period: schedule.period,
          groupName: schedule.group?.name,
          startDate: startDate,
          endDate: new Date(),
          reportData: reportDataPayload,
        },
      });
    }

    // Generate PDF and upload images
    await this.generatePdfAndUploadImages(
      snapshotId,
      reportDataPayload,
      schedule,
    );

    const publicUrl = `http://prtg.harutaka.web.id/report/${snapshotId}`;

    if (configMessages.length > 0) {
      fullMessage += configMessages.join('\n\n');
      if (schedule.includeLink) {
        fullMessage += `\n\nLihat detail laporan lengkap:\n${publicUrl}`;
      }
    } else {
      fullMessage += `Tidak ada insiden yang memenuhi kriteria pengiriman WhatsApp.`;
      if (schedule.includeLink) {
        fullMessage += `\n\nLihat detail laporan lengkap:\n${publicUrl}`;
      }
    }

    const recipients = await this.getRecipientsForSchedule(schedule);
    for (const recipient of recipients) {
      try {
        await this.whatsappSenderService.sendTextToNumbers(
          [recipient.phoneNumber],
          fullMessage,
        );
        sentCount++;
      } catch (error) {
        this.logger.error(
          `Failed to send receipt to ${recipient.phoneNumber}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: { isVerified: true, isBlocked: false },
      ...(schedule.groupId
        ? { include: { mutes: { where: { groupId: schedule.groupId } } } }
        : {}),
    });

    const eligibleUsers = schedule.groupId
      ? telegramUsers.filter((u: any) => u.mutes.length === 0)
      : telegramUsers;

    for (const user of eligibleUsers) {
      try {
        await this.telegramSenderService.sendTextToChatId(
          user.telegramId,
          fullMessage,
        );
      } catch (error) {
        this.logger.error(
          `Failed to send receipt to Telegram ${user.telegramId}`,
        );
      }
    }

    return this.buildSummary(schedule, sentCount, totalIncidentsFound, false);
  }

  private formatTimeWib(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    })
      .format(date)
      .replace('.', ':');
  }

  private formatPrtgDate(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  }

  private getStartDate(period: ReceiptPeriod): Date {
    const start = new Date();

    switch (period) {
      case ReceiptPeriod.DAILY:
        start.setHours(0, 0, 0, 0);
        break;
      case ReceiptPeriod.WEEKLY:
        start.setDate(start.getDate() - 7);
        break;
      case ReceiptPeriod.MONTHLY:
        start.setDate(start.getDate() - 30);
        break;
      default:
        start.setHours(0, 0, 0, 0);
    }
    return start;
  }

  private async getRecipientsForSchedule(schedule: ReceiptSchedule) {
    // Fetch ReceiptRecipient specifically
    const where: any = { enabled: true };
    if (schedule.targetMode === ScheduleTargetMode.group_only) {
      where.targetType = 'group';
    } else if (schedule.targetMode === ScheduleTargetMode.personal_only) {
      where.targetType = 'contact';
    }

    const allRecipients = await this.prisma.receiptRecipient.findMany({
      where,
    });

    // Filter by group if needed
    // If recipient.groupId is null, they receive for all groups.
    return allRecipients.filter((r) => {
      if (!schedule.groupId) return true;
      if (r.groupId === null) return true;
      return r.groupId === schedule.groupId;
    });
  }

  private buildSummary(
    schedule: ReceiptSchedule & { group: any },
    sentRecipients: number,
    incidentsFound: number,
    skipped: boolean,
  ): ReceiptDispatchSummary {
    return {
      scheduleId: schedule.id,
      scheduleName: schedule.name,
      groupName: schedule.group?.name ?? null,
      targetMode: schedule.targetMode,
      result: {
        sentRecipients,
        incidentsFound,
        skipped,
      },
    };
  }

  async updateSnapshot(
    snapshotId: string,
  ): Promise<{ success: boolean; updatedConfigs: number }> {
    const snapshot = await this.prisma.receiptReportSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (!snapshot) throw new Error('Snapshot not found');

    const schedule = snapshot.scheduleId
      ? await this.prisma.receiptSchedule.findUnique({
          where: { id: snapshot.scheduleId },
          include: { group: true },
        })
      : null;

    const startDate = snapshot.startDate;
    const endDate = new Date();

    const configs = await this.prisma.prtgConfig.findMany({
      where: schedule?.groupId
        ? { groupId: schedule.groupId, enabled: true, maintenance: false }
        : { enabled: true, maintenance: false },
      include: { group: true },
    });

    if (configs.length === 0) return { success: true, updatedConfigs: 0 };

    const configIds = configs.map((c) => c.id);
    const histories = await this.prisma.monitoringHistory.findMany({
      where: {
        configId: { in: configIds },
        timestamp: { gte: startDate, lte: endDate },
      },
      orderBy: { timestamp: 'asc' },
    });

    type Incident = {
      status: NocStatus;
      time: Date;
      recoveryTime?: Date;
      inboundBefore?: number | null;
      outboundBefore?: number | null;
      inboundDuring?: number | null;
      outboundDuring?: number | null;
    };
    const incidentsByConfig = new Map<number, Incident[]>();

    const periodAverages = new Map<
      number,
      { avgIn: number | null; avgOut: number | null }
    >();
    for (const configId of configIds) {
      const validHistories = histories.filter(
        (h) => h.configId === configId && h.inboundBitrate !== null,
      );
      if (validHistories.length > 0) {
        const sumIn = validHistories.reduce(
          (acc, h) => acc + h.inboundBitrate!,
          0,
        );
        const sumOut = validHistories.reduce(
          (acc, h) => acc + h.outboundBitrate!,
          0,
        );
        periodAverages.set(configId, {
          avgIn: sumIn / validHistories.length,
          avgOut: sumOut / validHistories.length,
        });
      } else {
        periodAverages.set(configId, { avgIn: null, avgOut: null });
      }
    }

    const previousState = new Map<
      number,
      { status: NocStatus; inbound: number | null; outbound: number | null }
    >();

    for (const history of histories) {
      const prev = previousState.get(history.configId) || {
        status: NocStatus.NORMAL,
        inbound: null,
        outbound: null,
      };

      if (history.status !== prev.status) {
        const configIncidents = incidentsByConfig.get(history.configId);
        if (configIncidents && configIncidents.length > 0) {
          const lastIncident = configIncidents[configIncidents.length - 1];
          if (!lastIncident.recoveryTime)
            lastIncident.recoveryTime = history.timestamp;
        }

        const averages = periodAverages.get(history.configId);

        if (
          history.status === NocStatus.DOWN ||
          history.status === NocStatus.LOW_TRAFFIC
        ) {
          let lastSameStatusIncidentIdx = -1;
          if (configIncidents) {
            for (let i = configIncidents.length - 1; i >= 0; i--) {
              if (configIncidents[i].status === history.status) {
                lastSameStatusIncidentIdx = i;
                break;
              }
            }
          }

          let merged = false;
          if (lastSameStatusIncidentIdx !== -1) {
            const lastSameStatus = configIncidents![lastSameStatusIncidentIdx];
            const compareTime =
              lastSameStatus.recoveryTime || lastSameStatus.time;
            if (
              history.timestamp.getTime() - compareTime.getTime() <
              60 * 60 * 1000
            ) {
              // Flapping! Merge by reopening the previous incident of the same status
              lastSameStatus.recoveryTime = undefined;
              lastSameStatus.inboundDuring = history.inboundBitrate;
              lastSameStatus.outboundDuring = history.outboundBitrate;

              // Remove any intermediate short-lived incidents (e.g. LOW_TRAFFIC) between the flaps
              configIncidents!.splice(lastSameStatusIncidentIdx + 1);
              merged = true;
            }
          }

          if (!merged) {
            if (!incidentsByConfig.has(history.configId))
              incidentsByConfig.set(history.configId, []);
            incidentsByConfig.get(history.configId)!.push({
              status: history.status,
              time: history.timestamp,
              inboundBefore:
                history.status === NocStatus.LOW_TRAFFIC
                  ? (averages?.avgIn ?? prev.inbound)
                  : prev.inbound,
              outboundBefore:
                history.status === NocStatus.LOW_TRAFFIC
                  ? (averages?.avgOut ?? prev.outbound)
                  : prev.outbound,
              inboundDuring: history.inboundBitrate,
              outboundDuring: history.outboundBitrate,
            });
          }
        }
      }

      previousState.set(history.configId, {
        status: history.status,
        inbound:
          history.inboundBitrate !== null
            ? history.inboundBitrate
            : prev.inbound,
        outbound:
          history.outboundBitrate !== null
            ? history.outboundBitrate
            : prev.outbound,
      });
    }

    const reportDataPayload: any[] = [];
    for (const [configId, incidents] of incidentsByConfig.entries()) {
      if (incidents.length === 0) continue;
      const config = configs.find((c) => c.id === configId);
      if (!config) continue;

      const downCount = incidents.filter(
        (i) => i.status === NocStatus.DOWN,
      ).length;
      const lowTrafficCount = incidents.filter(
        (i) => i.status === NocStatus.LOW_TRAFFIC,
      ).length;

      reportDataPayload.push({
        configId: config.id,
        title: config.title,
        groupName: config.group?.name || 'N/A',
        sensorId: config.sensorId,
        downCount,
        lowTrafficCount,
        incidents: incidents.map((i) => {
          const sdateObj = new Date(i.time.getTime() - 30 * 60 * 1000);
          const recoveryObj = i.recoveryTime || new Date();
          const edateObj = new Date(recoveryObj.getTime() + 30 * 60 * 1000);

          return {
            status: i.status,
            time: i.time.toISOString(),
            recoveryTime: i.recoveryTime ? i.recoveryTime.toISOString() : null,
            formattedTime: `${this.formatTimeWib(i.time)} WIB`,
            inboundBefore: i.inboundBefore,
            inboundDuring: i.inboundDuring,
            outboundBefore: i.outboundBefore,
            outboundDuring: i.outboundDuring,
            threshold:
              i.status === NocStatus.LOW_TRAFFIC
                ? config.thresholdLow
                : config.downThreshold,
            sdate: this.formatPrtgDate(sdateObj),
            edate: this.formatPrtgDate(edateObj),
          };
        }),
      });
    }

    await this.prisma.receiptReportSnapshot.update({
      where: { id: snapshotId },
      data: {
        endDate,
        reportData: reportDataPayload,
      },
    });

    // Upload images and generate PDF
    await this.generatePdfAndUploadImages(
      snapshotId,
      reportDataPayload,
      schedule,
    );

    return { success: true, updatedConfigs: reportDataPayload.length };
  }

  private async generatePdfAndUploadImages(
    snapshotId: string,
    reportDataPayload: any[],
    schedule: any,
  ) {
    const settings = await this.prisma.prtgSetting.findFirst();
    const baseUrl = settings?.loginUrl ? new URL(settings.loginUrl) : null;

    if (!baseUrl || !settings) return;

    for (const config of reportDataPayload) {
      if (!config.incidents || config.incidents.length === 0) continue;

      const lastIncident = config.incidents[config.incidents.length - 1];
      const sdate = lastIncident.sdate;
      const edate = lastIncident.edate;

      const chartUrl = `${baseUrl.protocol}//${baseUrl.host}/chart.png?id=${config.sensorId}&avg=60&sdate=${sdate}&edate=${edate}&width=1200&height=600`;

      const imageBuffer = await this.screenshotService.capture(chartUrl);
      if (imageBuffer) {
        const periodStr = schedule?.period || 'MANUAL';
        const groupStr = schedule?.group?.name || 'N-A';
        const dateStr = this.formatPrtgDate(new Date())
          .split('-')
          .slice(0, 3)
          .join('-');
        const path = `reports/image/${periodStr}/${groupStr}/${dateStr}/${config.sensorId}_${snapshotId}.png`;

        const r2Url = await this.r2StorageService.uploadImage(
          imageBuffer,
          path,
        );
        if (r2Url) {
          config.r2ImageUrl = r2Url;
        }
      }
    }

    // Update payload with image URLs
    await this.prisma.receiptReportSnapshot.update({
      where: { id: snapshotId },
      data: { reportData: reportDataPayload },
    });

    // Generate PDF
    const updatedSnapshot = await this.prisma.receiptReportSnapshot.findUnique({
      where: { id: snapshotId },
    });
    if (updatedSnapshot) {
      const pdfBuffer =
        await this.pdfGeneratorService.generatePdf(updatedSnapshot);
      if (pdfBuffer) {
        const periodStr = schedule?.period || 'MANUAL';
        const groupStr = schedule?.group?.name || 'N-A';
        const dateStr = this.formatPrtgDate(new Date())
          .split('-')
          .slice(0, 3)
          .join('-');
        const pdfPath = `reports/pdf/${periodStr}/${groupStr}/${dateStr}/${snapshotId}.pdf`;

        const pdfUrl = await this.r2StorageService.uploadPdf(
          pdfBuffer,
          pdfPath,
        );
        if (pdfUrl) {
          await this.prisma.receiptReportSnapshot.update({
            where: { id: snapshotId },
            data: { pdfUrl },
          });
        }
      }
    }
  }

  async getReportData(
    groupId: number,
    start: Date,
    end: Date,
    includeDown: boolean,
    includeLowTraffic: boolean,
  ) {
    const configs = await this.prisma.prtgConfig.findMany({
      where: { groupId, enabled: true, maintenance: false },
      include: { group: true },
    });
    if (configs.length === 0) {
      return { groupName: 'N/A', configs: [] };
    }
    const groupName = configs[0].group?.name || 'N/A';
    const configIds = configs.map((c) => c.id);
    const histories = await this.prisma.monitoringHistory.findMany({
      where: {
        configId: { in: configIds },
        timestamp: { gte: start, lte: end },
      },
      orderBy: { timestamp: 'asc' },
    });

    const reportConfigs = configs.map((config) => {
      const h = histories.filter((h) => h.configId === config.id);
      const downCount = h.filter((x) => x.status === NocStatus.DOWN).length;
      return {
        title: config.title,
        downtimeTotalSeconds: downCount * 60, // approximate
      };
    });

    return { groupName, configs: reportConfigs };
  }

  async generateManualReport(
    chatId: number,
    period: 'DAILY' | 'MONTHLY',
    startDate: Date,
  ) {
    let snapshot = await this.prisma.receiptReportSnapshot.findFirst({
      where: { period, startDate, scheduleId: null, groupName: null },
      orderBy: { createdAt: 'desc' },
    });

    if (!snapshot) {
      const crypto = require('crypto');
      const snapshotId = crypto.randomBytes(5).toString('hex');
      snapshot = await this.prisma.receiptReportSnapshot.create({
        data: {
          id: snapshotId,
          scheduleId: null,
          period,
          groupName: null,
          startDate,
          endDate: new Date(),
          reportData: [],
        },
      });
    }

    await this.updateSnapshot(snapshot.id);
    snapshot = await this.prisma.receiptReportSnapshot.findUnique({
      where: { id: snapshot.id },
    });

    const periodText = period === 'DAILY' ? 'HARIAN' : 'BULANAN';
    let fullMessage = `*LAPORAN ${periodText} BW MANUAL*\n====================\n`;

    const settings = await this.prisma.prtgSetting.findFirst();
    const template =
      settings?.receiptMessageTemplate ||
      '*{title}*\nGROUP : {groupName}\n{details}';

    const configMessages: string[] = [];
    const reportData = (snapshot?.reportData as any[]) || [];

    for (const data of reportData) {
      const downCount = data.downCount;
      const lowTrafficCount = data.lowTrafficCount;
      if (downCount === 0 && lowTrafficCount === 0) continue;

      let detailsStr = '';
      if (downCount > 0) {
        detailsStr += `DOWN : ${downCount}x\ndijam :\n`;
        data.incidents
          .filter((i: any) => i.status === 'DOWN')
          .forEach((i: any) => {
            detailsStr += `- ${i.formattedTime}\n`;
          });
      }
      if (lowTrafficCount > 0) {
        if (detailsStr) detailsStr += '\n';
        detailsStr += `LOW TRAFFIC : ${lowTrafficCount}x\ndijam :\n`;
        data.incidents
          .filter((i: any) => i.status === 'LOW_TRAFFIC')
          .forEach((i: any) => {
            detailsStr += `- ${i.formattedTime}\n`;
          });
      }

      const configMsg = template
        .replace(/{title}/g, data.title)
        .replace(/{groupName}/g, data.groupName)
        .replace(/{details}/g, detailsStr.trim());

      configMessages.push(configMsg);
    }

    const publicUrl = `http://prtg.harutaka.web.id/report/${snapshot!.id}`;

    if (configMessages.length > 0) {
      fullMessage += configMessages.join('\n\n');
      fullMessage += `\n\nLihat detail laporan lengkap:\n${publicUrl}`;
    } else {
      fullMessage += `Semua koneksi terpantau Normal untuk periode ini.`;
      fullMessage += `\n\nLihat detail laporan lengkap:\n${publicUrl}`;
    }

    await this.telegramSenderService.sendTextToChatId(chatId, fullMessage);

    if (snapshot?.pdfUrl) {
      await this.telegramSenderService.sendDocumentToChatId(
        chatId,
        snapshot.pdfUrl,
        `Lampiran PDF Laporan ${periodText}`,
      );
    }
  }
}
