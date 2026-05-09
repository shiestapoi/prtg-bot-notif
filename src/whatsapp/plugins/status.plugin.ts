import { Injectable } from '@nestjs/common';
import type {
  PrtgConfigDto,
  PrtgRecipientDto,
  PrtgScheduleDto,
} from '../../prtg-report/prtg-report.types';
import { PrtgReportService } from '../../prtg-report/prtg-report.service';
import type { WhatsappPlugin, WhatsappPluginContext } from './whatsapp-plugin';

type ScheduleBucketKey = 'all' | 'group_only' | 'personal_only' | 'no_receipt';

@Injectable()
export class StatusPlugin implements WhatsappPlugin {
  name = 'status-plugin';

  constructor(private readonly prtgService: PrtgReportService) {}

  canHandle({ text }: WhatsappPluginContext) {
    const command = text?.trim().toLowerCase();
    return command === '/status' || command === '/info';
  }

  async handle(context: WhatsappPluginContext) {
    const [isAdmin, groups, configs, recipients, schedules] = await Promise.all(
      [
        this.prtgService.isAuthorizedWhatsappCommander(
          context.senderJids,
          context.isFromMe,
        ),
        this.prtgService.listGroups(),
        this.prtgService.listConfigs(),
        this.prtgService.listRecipients(),
        this.prtgService.listSchedules(),
      ],
    );

    const enabledRecipients = recipients.filter(
      (recipient) => recipient.enabled,
    );
    const groupReceipts = enabledRecipients.filter((recipient) =>
      this.isGroupReceipt(recipient),
    );
    const personalReceipts = enabledRecipients.filter((recipient) =>
      this.isPersonalReceipt(recipient),
    );
    const adminReceipts = enabledRecipients.filter(
      (recipient) => recipient.isAdmin && this.isPersonalReceipt(recipient),
    );
    const scheduleBuckets = this.bucketSchedules(schedules, enabledRecipients);

    const lines = [
      '*Haruyaki Ops Status*',
      '',
      `Pengirim: ${isAdmin ? 'ADMIN' : 'BUKAN ADMIN'}`,
      'Server: online',
      `Uptime: ${this.formatUptime(process.uptime())}`,
      '',
      '*Receipts*',
      `Admin: ${adminReceipts.length}`,
      `Group: ${groupReceipts.length}`,
      `Personal: ${personalReceipts.length}`,
      `Total: ${enabledRecipients.length}`,
      '',
      '*Schedules*',
      ...this.renderScheduleBucket('Group + personal', scheduleBuckets.all),
      ...this.renderScheduleBucket('Group only', scheduleBuckets.group_only),
      ...this.renderScheduleBucket(
        'Personal only',
        scheduleBuckets.personal_only,
      ),
      ...this.renderScheduleBucket(
        'Tanpa receipt aktif',
        scheduleBuckets.no_receipt,
      ),
      '',
      `*PRTG Groups (${groups.length})*`,
      ...groups.map(
        (group) => `- ${group.name} (${group.enabled ? 'on' : 'off'})`,
      ),
      '',
      '*PRTG Configs*',
      ...this.renderConfigsByGroup(configs),
    ];

    await context.sendMessage(
      context.remoteJid,
      { text: lines.join('\n') },
      { quoted: context.message },
    );
  }

  private bucketSchedules(
    schedules: PrtgScheduleDto[],
    recipients: PrtgRecipientDto[],
  ) {
    const buckets: Record<ScheduleBucketKey, PrtgScheduleDto[]> = {
      all: [],
      group_only: [],
      personal_only: [],
      no_receipt: [],
    };

    for (const schedule of schedules) {
      const matchingRecipients = this.getScheduleRecipients(
        schedule,
        recipients,
      );
      const hasGroup = matchingRecipients.some((recipient) =>
        this.isGroupReceipt(recipient),
      );
      const hasPersonal = matchingRecipients.some((recipient) =>
        this.isPersonalReceipt(recipient),
      );

      if (schedule.targetMode === 'group_only' && hasGroup) {
        buckets.group_only.push(schedule);
      } else if (schedule.targetMode === 'personal_only' && hasPersonal) {
        buckets.personal_only.push(schedule);
      } else if (schedule.targetMode === 'all' && hasGroup && hasPersonal) {
        buckets.all.push(schedule);
      } else if (schedule.targetMode === 'all' && hasGroup) {
        buckets.group_only.push(schedule);
      } else if (schedule.targetMode === 'all' && hasPersonal) {
        buckets.personal_only.push(schedule);
      } else {
        buckets.no_receipt.push(schedule);
      }
    }

    return buckets;
  }

  private getScheduleRecipients(
    schedule: PrtgScheduleDto,
    recipients: PrtgRecipientDto[],
  ) {
    return recipients.filter(
      (recipient) =>
        schedule.groupId === null ||
        recipient.groupId === null ||
        recipient.groupId === schedule.groupId,
    );
  }

  private renderScheduleBucket(title: string, schedules: PrtgScheduleDto[]) {
    const lines = [`${title}: ${schedules.length}`];
    if (schedules.length === 0) {
      return lines;
    }

    return [
      ...lines,
      ...schedules.map(
        (schedule) =>
          `- ${schedule.name} (${schedule.groupName || 'ALL'}, ${schedule.cron}, ${
            schedule.enabled ? 'on' : 'off'
          })`,
      ),
    ];
  }

  private renderConfigsByGroup(configs: PrtgConfigDto[]) {
    if (configs.length === 0) {
      return ['- Belum ada config'];
    }

    const grouped = new Map<string, PrtgConfigDto[]>();
    for (const config of configs) {
      const groupName = config.groupName || 'Tanpa group';
      grouped.set(groupName, [...(grouped.get(groupName) ?? []), config]);
    }

    return Array.from(grouped.entries()).flatMap(
      ([groupName, groupConfigs]) => [
        `[${groupName}] ${groupConfigs.length} config`,
        ...groupConfigs.map(
          (config) =>
            `- ${config.title} (${config.enabled && config.groupEnabled ? 'on' : 'off'})`,
        ),
      ],
    );
  }

  private isPersonalReceipt(recipient: PrtgRecipientDto) {
    return (
      recipient.targetType === 'contact' || recipient.targetType === 'manual'
    );
  }

  private isGroupReceipt(recipient: PrtgRecipientDto) {
    return (
      recipient.targetType === 'group' || recipient.targetType === 'channel'
    );
  }

  private formatUptime(value: number) {
    const totalSeconds = Math.max(0, Math.floor(value));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return [
      days ? `${days}d` : null,
      hours ? `${hours}h` : null,
      minutes ? `${minutes}m` : null,
      `${seconds}s`,
    ]
      .filter(Boolean)
      .join(' ');
  }
}
