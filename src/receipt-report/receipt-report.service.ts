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
        if (
          (schedule.includeDown && history.status === NocStatus.DOWN) ||
          (schedule.includeLowTraffic && history.status === NocStatus.LOW_TRAFFIC)
        ) {
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

    for (const [configId, incidents] of incidentsByConfig.entries()) {
      if (incidents.length === 0) continue;

      const config = configs.find(c => c.id === configId);
      if (!config) continue;

      const downCount = incidents.filter(i => i.status === NocStatus.DOWN).length;
      const lowTrafficCount = incidents.filter(i => i.status === NocStatus.LOW_TRAFFIC).length;

      let detailsStr = '';
      if (downCount > 0) {
        detailsStr += `DOWN : ${downCount}x\ndijam :\n`;
        incidents.filter(i => i.status === NocStatus.DOWN).forEach(i => {
          detailsStr += `- ${this.formatTimeWib(i.time)} WIB\n`;
        });
      }
      if (lowTrafficCount > 0) {
        if (detailsStr) detailsStr += '\n';
        detailsStr += `LOW TRAFFIC : ${lowTrafficCount}x\ndijam :\n`;
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
    
    fullMessage += configMessages.join('\n\n');

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
