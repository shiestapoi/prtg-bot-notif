import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import { ReceiptPeriod, NocStatus, ScheduleTargetMode, ReceiptSchedule, PrtgConfig } from '@prisma/client';
import { ReceiptDispatchSummary } from './receipt-report.types';

@Injectable()
export class ReceiptReportService {
  private readonly logger = new Logger(ReceiptReportService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSenderService: WhatsappSenderService,
  ) {}

  async dispatchSchedule(
    schedule: ReceiptSchedule & { group: { id: number; name: string } | null },
  ): Promise<ReceiptDispatchSummary> {
    const startDate = this.getStartDate(schedule.period);
    
    // 1. Get configs matching the schedule's group (or all if null)
    const configs = await this.prisma.prtgConfig.findMany({
      where: schedule.groupId ? { groupId: schedule.groupId, enabled: true } : { enabled: true },
      include: { group: true },
    });

    if (configs.length === 0) {
      return this.buildSummary(schedule, 0, 0, true);
    }

    // 2. Query history for these configs within the period
    const configIds = configs.map(c => c.id);
    const histories = await this.prisma.monitoringHistory.findMany({
      where: {
        configId: { in: configIds },
        timestamp: { gte: startDate },
      },
      orderBy: { timestamp: 'asc' }, // Ascending to detect state transitions
    });

    // 3. Process incidents per config
    // We detect transitions into DOWN or LOW_TRAFFIC
    type Incident = { status: NocStatus; time: Date };
    const incidentsByConfig = new Map<number, Incident[]>();
    
    // Track previous status to detect transitions
    const previousStatus = new Map<number, NocStatus>();

    for (const history of histories) {
      const prev = previousStatus.get(history.configId) || NocStatus.NORMAL;
      
      if (history.status !== prev) {
        // We ALWAYS capture DOWN and LOW_TRAFFIC for the web view snapshot
        if (history.status === NocStatus.DOWN || history.status === NocStatus.LOW_TRAFFIC) {
          if (!incidentsByConfig.has(history.configId)) {
            incidentsByConfig.set(history.configId, []);
          }
          incidentsByConfig.get(history.configId)!.push({
            status: history.status,
            time: history.timestamp,
          });
        }
      }
      previousStatus.set(history.configId, history.status);
    }

    let totalIncidentsFound = 0;
    for (const incidents of incidentsByConfig.values()) {
      totalIncidentsFound += incidents.length;
    }

    // 4. If no incidents found, skip sending
    if (totalIncidentsFound === 0) {
      this.logger.log(`ReceiptSchedule ${schedule.name} skipped: No matching incidents found.`);
      return this.buildSummary(schedule, 0, 0, true);
    }

    // 5. Build and send messages
    const settings = await this.prisma.prtgSetting.findFirst();
    const template = settings?.receiptMessageTemplate || '*{title}*\nGROUP : {groupName}\n{details}';

    let sentCount = 0;
    
    // Construct Title
    const periodText = schedule.period === 'DAILY' ? 'HARIAN' : schedule.period === 'WEEKLY' ? 'MINGGUAN' : 'BULANAN';
    let fullMessage = `*LAPORAN ${periodText} BW*\n====================\n`;
    
    const configMessages: string[] = [];
    const reportDataPayload: any[] = [];

    for (const [configId, incidents] of incidentsByConfig.entries()) {
      if (incidents.length === 0) continue;

      const config = configs.find(c => c.id === configId);
      if (!config) continue;

      // Add to snapshot payload (includes ALL DOWN and LOW TRAFFIC regardless of schedule settings)
      reportDataPayload.push({
        configId: config.id,
        title: config.title,
        groupName: config.group?.name || 'N/A',
        downCount,
        lowTrafficCount,
        incidents: incidents.map(i => ({
          status: i.status,
          time: i.time.toISOString(),
          formattedTime: `${this.formatTimeWib(i.time)} WIB`
        }))
      });

      // Filter for WhatsApp based on schedule settings
      const waDownCount = schedule.includeDown ? downCount : 0;
      const waLowTrafficCount = schedule.includeLowTraffic ? lowTrafficCount : 0;

      if (waDownCount === 0 && waLowTrafficCount === 0) continue;

      let detailsStr = '';
      if (waDownCount > 0) {
        detailsStr += `DOWN : ${waDownCount}x\ndijam :\n`;
        incidents.filter(i => i.status === NocStatus.DOWN).forEach(i => {
          detailsStr += `- ${this.formatTimeWib(i.time)} WIB\n`;
        });
      }
      if (waLowTrafficCount > 0) {
        if (detailsStr) detailsStr += '\n';
        detailsStr += `LOW TRAFFIC : ${waLowTrafficCount}x\ndijam :\n`;
        incidents.filter(i => i.status === NocStatus.LOW_TRAFFIC).forEach(i => {
          detailsStr += `- ${this.formatTimeWib(i.time)} WIB\n`;
        });
      }

      let configMsg = template
        .replace(/{title}/g, config.title)
        .replace(/{groupName}/g, config.group?.name || 'N/A')
        .replace(/{details}/g, detailsStr.trim());
      
      configMessages.push(configMsg);
    }
    
    // Save Snapshot to Database
    const snapshot = await this.prisma.receiptReportSnapshot.create({
      data: {
        scheduleId: schedule.id,
        period: schedule.period,
        groupName: schedule.group?.name,
        startDate: startDate,
        endDate: new Date(),
        reportData: reportDataPayload,
      }
    });

    const publicUrl = `http://prtg.harutaka.web.id/public/report/${snapshot.id}`;

    if (configMessages.length > 0) {
      fullMessage += configMessages.join('\n\n');
      fullMessage += `\n\nLihat detail laporan lengkap:\n${publicUrl}`;
    } else {
      fullMessage += `Tidak ada insiden yang memenuhi kriteria pengiriman WhatsApp.\n\nLihat detail laporan lengkap:\n${publicUrl}`;
    }

    const recipients = await this.getRecipientsForSchedule(schedule);
    for (const recipient of recipients) {
      try {
        await this.whatsappSenderService.sendTextToNumbers([recipient.phoneNumber], fullMessage);
        sentCount++;
      } catch (error) {
        this.logger.error(`Failed to send receipt to ${recipient.phoneNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    return this.buildSummary(schedule, sentCount, totalIncidentsFound, false);
  }

  private formatTimeWib(date: Date): string {
    return new Intl.DateTimeFormat('id-ID', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Jakarta',
    }).format(date).replace('.', ':');
  }

  private getStartDate(period: ReceiptPeriod): Date {
    const start = new Date();
    
    switch (period) {
      case ReceiptPeriod.DAILY:
        start.setHours(start.getHours() - 24);
        break;
      case ReceiptPeriod.WEEKLY:
        start.setDate(start.getDate() - 7);
        break;
      case ReceiptPeriod.MONTHLY:
        start.setDate(start.getDate() - 30);
        break;
      default:
        start.setHours(start.getHours() - 24);
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

    const allRecipients = await this.prisma.receiptRecipient.findMany({ where });

    // Filter by group if needed
    // If recipient.groupId is null, they receive for all groups.
    return allRecipients.filter(r => {
      if (!schedule.groupId) return true;
      if (r.groupId === null) return true;
      return r.groupId === schedule.groupId;
    });
  }

  private buildSummary(schedule: ReceiptSchedule & { group: any }, sentRecipients: number, incidentsFound: number, skipped: boolean): ReceiptDispatchSummary {
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
}
