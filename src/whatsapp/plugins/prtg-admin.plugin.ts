import { Injectable } from '@nestjs/common';
import { PrtgReportSchedulerService } from '../../prtg-report/prtg-report-scheduler.service';
import { PrtgReportService } from '../../prtg-report/prtg-report.service';
import type {
  PrtgRecipientDto,
  ScheduleDispatchSummary,
} from '../../prtg-report/prtg-report.types';
import type { WhatsappPlugin, WhatsappPluginContext } from './whatsapp-plugin';

function splitArgs(value: string) {
  return value
    .split('|')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function parseOnOff(value: string) {
  const normalized = normalize(value);
  if (['on', 'enable', 'enabled', 'true', 'yes'].includes(normalized)) {
    return true;
  }
  if (['off', 'disable', 'disabled', 'false', 'no'].includes(normalized)) {
    return false;
  }

  throw new Error(`Nilai "${value}" harus on/off.`);
}

function parseOptionalOnOff(value: string | undefined) {
  return value === undefined ? undefined : parseOnOff(value);
}

function cleanCommand(command: string) {
  return command.replace(/\s+/g, ' ').trim();
}

function parseId(value: string, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error(`${label} harus angka positif.`);
  }

  return id;
}

function parseFields(value: string) {
  const fields = new Map<string, string>();
  for (const part of splitArgs(value)) {
    const separator = part.indexOf('=');
    if (separator <= 0) {
      throw new Error(`Field "${part}" harus format key=value.`);
    }

    fields.set(
      normalize(part.slice(0, separator)),
      part.slice(separator + 1).trim(),
    );
  }

  return fields;
}

function readField(
  fields: Map<string, string>,
  names: string[],
): string | undefined {
  for (const name of names) {
    const value = fields.get(name);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

@Injectable()
export class PrtgAdminPlugin implements WhatsappPlugin {
  name = 'prtg-admin-plugin';

  constructor(
    private readonly prtgService: PrtgReportService,
    private readonly scheduler: PrtgReportSchedulerService,
  ) {}

  canHandle({ text }: WhatsappPluginContext) {
    return text?.trim().toLowerCase().startsWith('/prtg') ?? false;
  }

  async handle(context: WhatsappPluginContext) {
    const rawText = context.text?.trim() ?? '';
    const command = cleanCommand(rawText.replace(/^\/prtg\b/i, ''));
    const isAdmin = await this.prtgService.isAuthorizedWhatsappCommander(
      context.senderJids,
      context.isFromMe,
    );

    if (!isAdmin) {
      return;
    }

    try {
      const reply = await this.runCommand(command);
      await context.sendMessage(
        context.remoteJid,
        { text: reply },
        { quoted: context.message },
      );
    } catch (error) {
      await context.sendMessage(
        context.remoteJid,
        {
          text: `Gagal: ${error instanceof Error ? error.message : String(error)}`,
        },
        { quoted: context.message },
      );
    }
  }

  private async runCommand(command: string) {
    const lower = normalize(command);

    if (!command || lower === 'help' || lower === 'menu') {
      return this.renderHelp();
    }

    if (
      lower === 'groups' ||
      lower === 'group list' ||
      lower === 'groups list'
    ) {
      return this.listGroups();
    }

    if (/^groups?\s+(add|create)\s+/i.test(command)) {
      const name = command.replace(/^groups?\s+(add|create)\s+/i, '').trim();
      const group = await this.prtgService.createGroup({ name, enabled: true });
      return `Group dibuat: ${group.id}. ${group.name}`;
    }

    const groupDetail = command.match(
      /^groups?\s+(get|read|show|detail)\s+(.+)$/i,
    );
    if (groupDetail) {
      const group = await this.resolveGroup(groupDetail[2]);
      return this.formatGroupDetail(group);
    }

    const groupUpdate = command.match(
      /^groups?\s+(update|edit)\s+(.+?)\s*\|\s*(.+)$/i,
    );
    if (groupUpdate) {
      const group = await this.resolveGroup(groupUpdate[2]);
      const fields = parseFields(groupUpdate[3]);
      const updated = await this.prtgService.updateGroup(group.id, {
        name: readField(fields, ['name', 'nama']),
        enabled: parseOptionalOnOff(readField(fields, ['enabled', 'status'])),
      });
      await this.scheduler.syncSchedules();
      return `Group diperbarui:\n${this.formatGroupDetail(updated)}`;
    }

    const groupRename = command.match(/^group\s+rename\s+(.+?)\s*\|\s*(.+)$/i);
    if (groupRename) {
      const group = await this.resolveGroup(groupRename[1]);
      const updated = await this.prtgService.updateGroup(group.id, {
        name: groupRename[2],
      });
      return `Group diganti nama: ${updated.id}. ${updated.name}`;
    }

    const groupToggle = command.match(/^group\s+(on|off)\s+(.+)$/i);
    if (groupToggle) {
      const group = await this.resolveGroup(groupToggle[2]);
      const updated = await this.prtgService.updateGroup(group.id, {
        enabled: groupToggle[1].toLowerCase() === 'on',
      });
      await this.scheduler.syncSchedules();
      return `Group ${updated.name} sekarang ${updated.enabled ? 'on' : 'off'}.`;
    }

    if (/^groups?\s+(delete|remove)\s+/i.test(command)) {
      const group = await this.resolveGroup(
        command.replace(/^groups?\s+(delete|remove)\s+/i, ''),
      );
      await this.prtgService.deleteGroup(group.id);
      await this.scheduler.syncSchedules();
      return `Group dihapus: ${group.name}`;
    }

    if (
      lower === 'configs' ||
      lower === 'config list' ||
      lower === 'configs list'
    ) {
      return this.listConfigs();
    }

    if (/^configs?\s+(add|create)\s+/i.test(command)) {
      const parts = splitArgs(
        command.replace(/^configs?\s+(add|create)\s+/i, ''),
      );
      if (parts.length < 3) {
        throw new Error(
          'Format: /prtg config add <group> | <title> | <sensorId>',
        );
      }
      const group = await this.resolveGroup(parts[0]);
      const sensorId = parseId(parts[2], 'sensor ID');
      const config = await this.prtgService.createConfig({
        groupId: group.id,
        title: parts[1],
        sensorId,
        enabled: true,
      });
      return `Config dibuat: ${config.id}. ${config.title}`;
    }

    const configDetail = command.match(
      /^configs?\s+(get|read|show|detail)\s+(\d+)$/i,
    );
    if (configDetail) {
      return this.getConfigDetail(parseId(configDetail[2], 'config id'));
    }

    const configUpdate = command.match(
      /^configs?\s+(update|edit)\s+(\d+)\s*\|\s*(.+)$/i,
    );
    if (configUpdate) {
      const fields = parseFields(configUpdate[3]);
      const groupName = readField(fields, ['group', 'groupname', 'group_name']);
      const group = groupName ? await this.resolveGroup(groupName) : null;
      const sensorIdValue = readField(fields, [
        'sensorid',
        'sensor_id',
        'sensor',
        'id',
      ]);
      const config = await this.prtgService.updateConfig(
        parseId(configUpdate[2], 'config id'),
        {
          groupId: group?.id,
          title: readField(fields, ['title', 'name', 'nama']),
          sensorId: sensorIdValue
            ? parseId(sensorIdValue, 'sensor ID')
            : undefined,
          enabled: parseOptionalOnOff(readField(fields, ['enabled', 'status'])),
        },
      );
      return `Config diperbarui:\n${this.formatConfigDetail(config)}`;
    }

    const configToggle = command.match(/^configs?\s+(on|off)\s+(\d+)$/i);
    if (configToggle) {
      const updated = await this.prtgService.updateConfig(
        Number(configToggle[2]),
        {
          enabled: configToggle[1].toLowerCase() === 'on',
        },
      );
      return `Config ${updated.title} sekarang ${updated.enabled ? 'on' : 'off'}.`;
    }

    const configDelete = command.match(/^configs?\s+(delete|remove)\s+(\d+)$/i);
    if (configDelete) {
      await this.prtgService.deleteConfig(
        parseId(configDelete[2], 'config id'),
      );
      return `Config dihapus: ${configDelete[2]}`;
    }

    if (
      lower === 'cookies' ||
      lower === 'cookie list' ||
      lower === 'cookies list'
    ) {
      const cookies = await this.prtgService.listCookies();
      return cookies.length
        ? cookies
            .map(
              (cookie) =>
                `${cookie.id}. ${cookie.label || 'Cookie'} (${cookie.isActive ? 'active' : 'inactive'})`,
            )
            .join('\n')
        : 'Belum ada cookie.';
    }

    if (/^cookies?\s+(set|add|create)\s+/i.test(command)) {
      const value = command
        .replace(/^cookies?\s+(set|add|create)\s+/i, '')
        .trim();
      const cookie = await this.prtgService.createCookie({
        label: 'WhatsApp admin',
        value,
        isActive: true,
      });
      return `Cookie aktif disimpan: ${cookie.id}.`;
    }

    const cookieDetail = command.match(
      /^cookies?\s+(get|read|show|detail)\s+(\d+)$/i,
    );
    if (cookieDetail) {
      return this.getCookieDetail(parseId(cookieDetail[2], 'cookie id'));
    }

    const cookieUpdate = command.match(
      /^cookies?\s+(update|edit)\s+(\d+)\s*\|\s*(.+)$/i,
    );
    if (cookieUpdate) {
      const fields = parseFields(cookieUpdate[3]);
      const cookie = await this.prtgService.updateCookie(
        parseId(cookieUpdate[2], 'cookie id'),
        {
          label: readField(fields, ['label', 'name', 'nama']),
          value: readField(fields, ['value', 'cookie', 'curl']),
          isActive: parseOptionalOnOff(
            readField(fields, ['active', 'enabled', 'status']),
          ),
        },
      );
      return `Cookie diperbarui:\n${this.formatCookieDetail(cookie)}`;
    }

    const cookieToggle = command.match(/^cookies?\s+(on|off)\s+(\d+)$/i);
    if (cookieToggle) {
      const updated = await this.prtgService.updateCookie(
        parseId(cookieToggle[2], 'cookie id'),
        { isActive: cookieToggle[1].toLowerCase() === 'on' },
      );
      return `Cookie ${updated.id} sekarang ${updated.isActive ? 'active' : 'inactive'}.`;
    }

    const cookieDelete = command.match(/^cookies?\s+(delete|remove)\s+(\d+)$/i);
    if (cookieDelete) {
      await this.prtgService.deleteCookie(
        parseId(cookieDelete[2], 'cookie id'),
      );
      return `Cookie dihapus: ${cookieDelete[2]}`;
    }

    if (
      lower === 'recipients' ||
      lower === 'recipient list' ||
      lower === 'recipients list' ||
      lower === 'receipts' ||
      lower === 'receipt list' ||
      lower === 'receipts list'
    ) {
      return this.listRecipients();
    }

    if (/^(recipients?|receipts?)\s+(add|create)\s+/i.test(command)) {
      const parts = splitArgs(
        command.replace(/^(recipients?|receipts?)\s+(add|create)\s+/i, ''),
      );
      if (parts.length < 2) {
        throw new Error(
          'Format: /prtg receipt add <label> | <nomor/jid> | <manual/contact/group/channel> | <group/ALL> | <admin on/off> | <on/off>',
        );
      }
      const groupId =
        parts[3] && normalize(parts[3]) !== 'all'
          ? (await this.resolveGroup(parts[3])).id
          : null;
      const recipient = await this.prtgService.createRecipient({
        label: parts[0],
        phoneNumber: parts[1],
        targetType: parts[2],
        groupId,
        isAdmin: parseOptionalOnOff(parts[4]) ?? false,
        enabled: parseOptionalOnOff(parts[5]) ?? true,
      });
      return `Receipt dibuat: ${this.formatRecipient(recipient)}`;
    }

    const receiptEdit = command.match(
      /^(recipients?|receipts?)\s+(edit|update)\s+(\d+)\s*\|\s*(.+)$/i,
    );
    if (receiptEdit) {
      const fields = parseFields(receiptEdit[4]);
      const groupValue = readField(fields, [
        'group',
        'scope',
        'groupid',
        'group_id',
      ]);
      const groupId =
        groupValue && normalize(groupValue) !== 'all'
          ? (await this.resolveGroup(groupValue)).id
          : groupValue
            ? null
            : undefined;
      const payload: Parameters<typeof this.prtgService.updateRecipient>[1] = {
        label: readField(fields, ['label', 'name', 'nama']),
        phoneNumber: readField(fields, [
          'phone',
          'number',
          'nomor',
          'jid',
          'target',
        ]),
        targetType: readField(fields, ['type', 'targettype', 'target_type']),
        isAdmin: parseOptionalOnOff(
          readField(fields, ['admin', 'isadmin', 'is_admin']),
        ),
        enabled: parseOptionalOnOff(readField(fields, ['enabled', 'status'])),
      };
      if (groupId !== undefined) {
        payload.groupId = groupId;
      }
      const recipient = await this.prtgService.updateRecipient(
        parseId(receiptEdit[3], 'receipt id'),
        payload,
      );
      return `Receipt diperbarui: ${this.formatRecipient(recipient)}`;
    }

    const receiptToggle = command.match(
      /^(recipients?|receipts?)\s+(on|off)\s+(\d+)$/i,
    );
    if (receiptToggle) {
      const updated = await this.prtgService.updateRecipient(
        Number(receiptToggle[3]),
        { enabled: receiptToggle[2].toLowerCase() === 'on' },
      );
      return `${updated.label || updated.phoneNumber} sekarang ${updated.enabled ? 'on' : 'off'}.`;
    }

    const adminToggle = command.match(
      /^(recipients?|receipts?)\s+admin\s+(\d+)\s+(on|off)$/i,
    );
    if (adminToggle) {
      const updated = await this.prtgService.updateRecipient(
        Number(adminToggle[2]),
        {
          isAdmin: adminToggle[3].toLowerCase() === 'on',
        },
      );
      return `${updated.label || updated.phoneNumber} admin ${updated.isAdmin ? 'on' : 'off'}.`;
    }

    const receiptGroup = command.match(
      /^(recipients?|receipts?)\s+group\s+(\d+)\s+(.+)$/i,
    );
    if (receiptGroup) {
      const groupId =
        normalize(receiptGroup[3]) === 'all'
          ? null
          : (await this.resolveGroup(receiptGroup[3])).id;
      const updated = await this.prtgService.updateRecipient(
        Number(receiptGroup[2]),
        {
          groupId,
        },
      );
      return `${updated.label || updated.phoneNumber} scope ${updated.groupName || 'ALL'}.`;
    }

    const receiptDelete = command.match(
      /^(recipients?|receipts?)\s+(delete|remove)\s+(\d+)$/i,
    );
    if (receiptDelete) {
      await this.prtgService.deleteRecipient(
        parseId(receiptDelete[3], 'receipt id'),
      );
      return `Receipt dihapus: ${receiptDelete[3]}`;
    }

    const receiptDetail = command.match(
      /^(recipients?|receipts?)\s+(get|read|show|detail)\s+(\d+)$/i,
    );
    if (receiptDetail) {
      return this.getReceiptDetail(parseId(receiptDetail[3], 'receipt id'));
    }

    if (
      lower === 'schedules' ||
      lower === 'schedule list' ||
      lower === 'schedules list'
    ) {
      return this.listSchedules();
    }

    const scheduleRunAll = command.match(
      /^schedules?\s+(run|send|dispatch|start)\s+all$/i,
    );
    if (scheduleRunAll) {
      const result = await this.scheduler.dispatchEnabledSchedules();
      return this.formatScheduleDispatchResults(result);
    }

    const scheduleRun = command.match(
      /^schedules?\s+(run|send|dispatch|start)\s+(\d+)$/i,
    );
    if (scheduleRun) {
      const result = await this.scheduler.dispatchSchedule(
        parseId(scheduleRun[2], 'schedule id'),
      );
      return this.formatScheduleDispatchResults([result]);
    }

    if (/^schedules?\s+(add|create)\s+/i.test(command)) {
      const parts = splitArgs(
        command.replace(/^schedules?\s+(add|create)\s+/i, ''),
      );
      if (parts.length < 3) {
        throw new Error(
          'Format: /prtg schedule add <nama> | <group/ALL> | <cron> | <all/group_only/personal_only>',
        );
      }
      const groupId =
        normalize(parts[1]) === 'all'
          ? null
          : (await this.resolveGroup(parts[1])).id;
      const schedule = await this.prtgService.createSchedule({
        name: parts[0],
        groupId,
        cron: parts[2],
        targetMode: parts[3],
        enabled: true,
      });
      await this.scheduler.syncSchedules();
      return `Schedule dibuat: ${schedule.id}. ${schedule.name}`;
    }

    const scheduleEdit = command.match(
      /^schedules?\s+(edit|update)\s+(\d+)\s*\|\s*(.+)$/i,
    );
    if (scheduleEdit) {
      const fields = parseFields(scheduleEdit[3]);
      const groupValue = readField(fields, [
        'group',
        'scope',
        'groupid',
        'group_id',
      ]);
      const groupId =
        groupValue && normalize(groupValue) !== 'all'
          ? (await this.resolveGroup(groupValue)).id
          : groupValue
            ? null
            : undefined;
      const payload: Parameters<typeof this.prtgService.updateSchedule>[1] = {
        name: readField(fields, ['name', 'nama']),
        cron: readField(fields, ['cron']),
        targetMode: readField(fields, ['target', 'targetmode', 'target_mode']),
        enabled: parseOptionalOnOff(readField(fields, ['enabled', 'status'])),
      };
      if (groupId !== undefined) {
        payload.groupId = groupId;
      }
      const schedule = await this.prtgService.updateSchedule(
        parseId(scheduleEdit[2], 'schedule id'),
        payload,
      );
      await this.scheduler.syncSchedules();
      return `Schedule diperbarui: ${schedule.id}. ${schedule.name}`;
    }

    const scheduleToggle = command.match(/^schedules?\s+(on|off)\s+(\d+)$/i);
    if (scheduleToggle) {
      const updated = await this.prtgService.updateSchedule(
        Number(scheduleToggle[2]),
        { enabled: scheduleToggle[1].toLowerCase() === 'on' },
      );
      await this.scheduler.syncSchedules();
      return `Schedule ${updated.name} sekarang ${updated.enabled ? 'on' : 'off'}.`;
    }

    const scheduleDelete = command.match(
      /^schedules?\s+(delete|remove)\s+(\d+)$/i,
    );
    if (scheduleDelete) {
      await this.prtgService.deleteSchedule(
        parseId(scheduleDelete[2], 'schedule id'),
      );
      await this.scheduler.syncSchedules();
      return `Schedule dihapus: ${scheduleDelete[2]}`;
    }

    const scheduleDetail = command.match(
      /^schedules?\s+(get|read|show|detail)\s+(\d+)$/i,
    );
    if (scheduleDetail) {
      return this.getScheduleDetail(parseId(scheduleDetail[2], 'schedule id'));
    }

    // ─── Monitoring Commands ──────────────────────────────────────────────

    const sendNotif = command.match(/^send\s+(\d+)$/i);
    if (sendNotif) {
      const configId = parseId(sendNotif[1], 'config id');
      const result = await this.prtgService.dispatchConfig(configId);
      return `Notif terkirim: ${result.sentConfigs} config, ${result.sentRecipients} receipt.`;
    }

    if (lower === 'status' || lower === 'monitoring' || lower === 'mon') {
      return this.getMonitoringStatus();
    }

    return 'Command tidak dikenal. Ketik /prtg help atau /help.';
  }

  private renderHelp() {
    return [
      '*PRTG Menu - Admin Only*',
      '',
      '*Groups*',
      '/prtg group list',
      '/prtg group get <id|nama>',
      '/prtg group create Kota Baru Pekanbaru',
      '/prtg group update <id|nama> | name=<nama> | enabled=<on/off>',
      '/prtg group on|off <id|nama>',
      '/prtg group delete <id|nama>',
      '',
      '*Configs*',
      '/prtg config list',
      '/prtg config get <id>',
      '/prtg config create <group> | <title> | <sensorId>',
      '/prtg config update <id> | group=<group> | title=<title> | sensorid=<id> | enabled=<on/off>',
      '/prtg config on|off <id>',
      '/prtg config delete <id>',
      '',
      '*Receipts*',
      '/prtg receipt list',
      '/prtg receipt get <id>',
      '/prtg receipt create <label> | <nomor/jid> | <manual/contact/group/channel> | <group/ALL> | <admin on/off> | <on/off>',
      '/prtg receipt update <id> | label=<label> | phone=<nomor/jid> | type=<type> | group=<group/ALL> | admin=<on/off> | enabled=<on/off>',
      '/prtg receipt on|off <id>',
      '/prtg receipt admin <id> on|off',
      '/prtg receipt group <id> <group/ALL>',
      '/prtg receipt delete <id>',
      '',
      '*Schedules*',
      '/prtg schedule list',
      '/prtg schedule get <id>',
      '/prtg schedule create <nama> | <group/ALL> | <cron> | <all/group_only/personal_only>',
      '/prtg schedule update <id> | name=<nama> | group=<group/ALL> | cron=<cron> | target=<target> | enabled=<on/off>',
      '/prtg schedule on|off <id>',
      '/prtg schedule run <id>',
      '/prtg schedule run all',
      '/prtg schedule delete <id>',
      '',
      '*Cookies*',
      '/prtg cookie list',
      '/prtg cookie get <id>',
      '/prtg cookie create <cookie/curl>',
      '/prtg cookie update <id> | label=<label> | value=<cookie/curl> | active=<on/off>',
      '/prtg cookie on|off <id>',
      '/prtg cookie delete <id>',
      '',
      '*Monitoring*',
      '/prtg send <configId> — kirim notif manual (gambar+status)',
      '/prtg status — lihat status monitoring semua config',
      '',
      'Semua command /prtg adalah admin-only. Gunakan | untuk memisahkan field panjang.',
    ].join('\n');
  }

  private async listGroups() {
    const groups = await this.prtgService.listGroups();
    return groups.length
      ? groups
          .map(
            (group) =>
              `${group.id}. ${group.name} (${group.enabled ? 'on' : 'off'})`,
          )
          .join('\n')
      : 'Belum ada group.';
  }

  private async listConfigs() {
    const configs = await this.prtgService.listConfigs();
    return configs.length
      ? configs
          .map(
            (config) =>
              `${config.id}. [${config.groupName}] ${config.title} (${config.enabled && config.groupEnabled ? 'on' : 'off'})`,
          )
          .join('\n')
      : 'Belum ada config.';
  }

  private async listRecipients() {
    const recipients = await this.prtgService.listRecipients();
    return recipients.length
      ? recipients
          .map((recipient) => this.formatRecipient(recipient))
          .join('\n')
      : 'Belum ada receipt.';
  }

  private async listSchedules() {
    const schedules = await this.prtgService.listSchedules();
    return schedules.length
      ? schedules
          .map(
            (schedule) =>
              `${schedule.id}. ${schedule.name} (${schedule.groupName || 'ALL'}, ${schedule.cron}, ${schedule.targetMode}, ${schedule.enabled ? 'on' : 'off'})`,
          )
          .join('\n')
      : 'Belum ada schedule.';
  }

  private formatScheduleDispatchResults(results: ScheduleDispatchSummary[]) {
    const lines = results.map((item) => {
      const group = item.groupName || 'ALL';
      return `${item.scheduleId}. ${item.scheduleName} [${group}, ${item.targetMode}] -> ${item.result.sentConfigs} config, ${item.result.sentRecipients} receipt`;
    });
    const sentConfigs = results.reduce(
      (total, item) => total + item.result.sentConfigs,
      0,
    );
    const sentRecipients = results.reduce(
      (total, item) => total + item.result.sentRecipients,
      0,
    );

    return [
      '*Schedule dispatch selesai*',
      ...lines,
      '',
      `Total: ${results.length} schedule, ${sentConfigs} config, ${sentRecipients} receipt.`,
    ].join('\n');
  }

  private formatRecipient(recipient: PrtgRecipientDto) {
    return `${recipient.id}. ${recipient.label || recipient.phoneNumber} [${recipient.targetType}, ${recipient.groupName || 'ALL'}, ${recipient.enabled ? 'on' : 'off'}${recipient.isAdmin ? ', admin' : ''}]`;
  }

  private formatGroupDetail(group: {
    id: number;
    name: string;
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
  }) {
    return [
      `ID: ${group.id}`,
      `Name: ${group.name}`,
      `Status: ${group.enabled ? 'on' : 'off'}`,
      group.createdAt ? `Created: ${group.createdAt}` : null,
      group.updatedAt ? `Updated: ${group.updatedAt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private formatConfigDetail(config: {
    id: number;
    title: string;
    sensorId: number;
    groupId: number;
    groupName: string;
    groupEnabled: boolean;
    enabled: boolean;
    cookieId: number | null;
    createdAt?: string;
    updatedAt?: string;
  }) {
    return [
      `ID: ${config.id}`,
      `Title: ${config.title}`,
      `Sensor ID: ${config.sensorId}`,
      `Group: ${config.groupName} (#${config.groupId}, ${config.groupEnabled ? 'on' : 'off'})`,
      `Status: ${config.enabled ? 'on' : 'off'}`,
      `Cookie ID: ${config.cookieId ?? '-'}`,
      config.createdAt ? `Created: ${config.createdAt}` : null,
      config.updatedAt ? `Updated: ${config.updatedAt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private formatCookieDetail(cookie: {
    id: number;
    label: string | null;
    value: string;
    isActive: boolean;
    createdAt?: string;
    updatedAt?: string;
  }) {
    return [
      `ID: ${cookie.id}`,
      `Label: ${cookie.label || '-'}`,
      `Status: ${cookie.isActive ? 'active' : 'inactive'}`,
      `Value: ${cookie.value}`,
      cookie.createdAt ? `Created: ${cookie.createdAt}` : null,
      cookie.updatedAt ? `Updated: ${cookie.updatedAt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private formatScheduleDetail(schedule: {
    id: number;
    name: string;
    groupId: number | null;
    groupName: string | null;
    cron: string;
    targetMode: string;
    enabled: boolean;
    createdAt?: string;
    updatedAt?: string;
  }) {
    return [
      `ID: ${schedule.id}`,
      `Name: ${schedule.name}`,
      `Group: ${schedule.groupName || 'ALL'}${schedule.groupId ? ` (#${schedule.groupId})` : ''}`,
      `Cron: ${schedule.cron}`,
      `Target: ${schedule.targetMode}`,
      `Status: ${schedule.enabled ? 'on' : 'off'}`,
      schedule.createdAt ? `Created: ${schedule.createdAt}` : null,
      schedule.updatedAt ? `Updated: ${schedule.updatedAt}` : null,
    ]
      .filter(Boolean)
      .join('\n');
  }

  private async getConfigDetail(id: number) {
    const config = (await this.prtgService.listConfigs()).find(
      (item) => item.id === id,
    );
    if (!config) {
      throw new Error(`Config "${id}" tidak ditemukan.`);
    }

    return this.formatConfigDetail(config);
  }

  private async getCookieDetail(id: number) {
    const cookie = (await this.prtgService.listCookies()).find(
      (item) => item.id === id,
    );
    if (!cookie) {
      throw new Error(`Cookie "${id}" tidak ditemukan.`);
    }

    return this.formatCookieDetail(cookie);
  }

  private async getReceiptDetail(id: number) {
    const receipt = (await this.prtgService.listRecipients()).find(
      (item) => item.id === id,
    );
    if (!receipt) {
      throw new Error(`Receipt "${id}" tidak ditemukan.`);
    }

    return [
      `ID: ${receipt.id}`,
      `Label: ${receipt.label || '-'}`,
      `Target: ${receipt.phoneNumber}`,
      `Type: ${receipt.targetType}`,
      `Group: ${receipt.groupName || 'ALL'}`,
      `Status: ${receipt.enabled ? 'on' : 'off'}`,
      `Admin: ${receipt.isAdmin ? 'yes' : 'no'}`,
      `Created: ${receipt.createdAt}`,
      `Updated: ${receipt.updatedAt}`,
    ].join('\n');
  }

  private async getScheduleDetail(id: number) {
    const schedule = (await this.prtgService.listSchedules()).find(
      (item) => item.id === id,
    );
    if (!schedule) {
      throw new Error(`Schedule "${id}" tidak ditemukan.`);
    }

    return this.formatScheduleDetail(schedule);
  }

  private async getMonitoringStatus() {
    const configs = await this.prtgService.listConfigs();
    const monitored = configs.filter((c) => c.monitoringEnabled);

    if (monitored.length === 0) {
      return 'Tidak ada config dengan monitoring aktif.';
    }

    const lines = monitored.map((c) => {
      const statusIcon =
        c.lastStatus === 'NORMAL'
          ? '🟢'
          : c.lastStatus === 'DOWN'
            ? '🔴'
            : c.lastStatus === 'NO_TRAFFIC'
              ? '🟠'
              : c.lastStatus === 'LOW_TRAFFIC'
                ? '🟡'
                : '⚪';
      return `${statusIcon} ${c.title} [${c.groupName}] — ${c.lastStatus}`;
    });

    return ['*Monitoring Status*', '', ...lines].join('\n');
  }

  private async resolveGroup(value: string) {
    const groups = await this.prtgService.listGroups();
    const id = Number(value);
    const group = Number.isNaN(id)
      ? groups.find((item) => normalize(item.name) === normalize(value))
      : groups.find((item) => item.id === id);

    if (!group) {
      throw new Error(`Group "${value}" tidak ditemukan.`);
    }

    return group;
  }
}
