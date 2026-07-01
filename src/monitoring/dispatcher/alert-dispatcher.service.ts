/* eslint-disable @typescript-eslint/no-unused-vars */
import { Injectable, Logger } from '@nestjs/common';
import { NocStatus, type RecipientTargetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappSenderService } from '../../whatsapp/whatsapp-sender.service';
import { TelegramSenderService } from '../../telegram/telegram-sender.service';
import { ScreenshotService } from './screenshot.service';

// â”€â”€â”€ Interfaces â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export interface DispatchDecision {
  shouldNotify: boolean;
  reason: string;
  templateType: 'anomaly' | 'recovery' | null;
}

export interface DispatchContext {
  configId: number;
  title: string;
  requestUrl: string;
  previousStatus: NocStatus;
  currentStatus: NocStatus;
  bitrate: number | null;
  inboundBitrate: number | null;
  outboundBitrate: number | null;
  timestamp: Date;
  reason: string;
  lastNotifiedAt: Date | null;
  cooldownInterval: number;
  groupId: number;
  groupName: string;
}

interface ResolvedRecipient {
  phoneNumber: string;
  targetType: RecipientTargetType;
}

// â”€â”€â”€ Pure Function: Dispatch Decision Logic â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Pure function that evaluates whether a notification should be dispatched.
 * No side effects — can be tested independently.
 *
 * Aturan utama:
 * - NORMAL â†’ anomaly: KIRIM (new_anomaly)
 * - anomaly â†’ NORMAL: KIRIM (recovered)
 * - anomaly A â†’ anomaly B (berbeda): KIRIM (status_escalation)
 * - anomaly â†’ anomaly SAMA: JANGAN KIRIM (sudah dinotifikasi sebelumnya)
 */
export function evaluateDispatch(
  previousStatus: NocStatus,
  currentStatus: NocStatus,
  lastNotifiedAt: Date | null,
  cooldownInterval: number,
): DispatchDecision {
  // Recovery: anomaly â†’ NORMAL
  if (
    previousStatus !== NocStatus.NORMAL &&
    currentStatus === NocStatus.NORMAL
  ) {
    return {
      shouldNotify: true,
      reason: 'recovered',
      templateType: 'recovery',
    };
  }

  // New anomaly: NORMAL â†’ anomaly
  if (
    previousStatus === NocStatus.NORMAL &&
    currentStatus !== NocStatus.NORMAL
  ) {
    return {
      shouldNotify: true,
      reason: 'new_anomaly',
      templateType: 'anomaly',
    };
  }

  // Status escalation during anomaly (e.g., LOW_TRAFFIC â†’ DOWN)
  if (previousStatus !== currentStatus && currentStatus !== NocStatus.NORMAL) {
    return {
      shouldNotify: true,
      reason: 'status_escalation',
      templateType: 'anomaly',
    };
  }

  // Same anomaly status (e.g., DOWN â†’ DOWN) — NEVER re-notify
  return {
    shouldNotify: false,
    reason: 'same_status_suppressed',
    templateType: null,
  };
}

// â”€â”€â”€ Template Rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

/**
 * Renders a template string by substituting placeholders with actual values.
 * Supported placeholders: {title}, {status}, {previousStatus}, {bitrate}, {trafficIn}, {trafficOut}, {timestamp}, {reason}, {groupName}, {time}
 */
export function renderTemplate(
  template: string,
  context: {
    title: string;
    status: string;
    previousStatus: string;
    bitrate: string;
    trafficIn: string;
    trafficOut: string;
    timestamp: string;
    time: string;
    reason: string;
    groupName: string;
  },
): string {
  return template
    .replace(/\{title\}/g, context.title)
    .replace(/\{status\}/g, context.status)
    .replace(/\{previousStatus\}/g, context.previousStatus)
    .replace(/\{bitrate\}/g, context.bitrate)
    .replace(/\{trafficIn\}/g, context.trafficIn)
    .replace(/\{trafficOut\}/g, context.trafficOut)
    .replace(/\{timestamp\}/g, context.timestamp)
    .replace(/\{time\}/g, context.time)
    .replace(/\{reason\}/g, context.reason)
    .replace(/\{groupName\}/g, context.groupName);
}

/**
 * Formats a Date to HH:MM string (hours:minutes only).
 */
function formatTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}

// â”€â”€â”€ Service â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsappSenderService,
    private readonly telegramSender: TelegramSenderService,
    private readonly screenshotService: ScreenshotService,
  ) {}

  /**
   * Main dispatch orchestration:
   * 1. Evaluate dispatch decision
   * 2. Capture screenshot (if notification needed)
   * 3. Fetch recipients (group-level + global)
   * 4. Fetch and render template from PrtgSetting
   * 5. Send via WhatsApp (image+caption or text-only)
   */
  async dispatch(context: DispatchContext): Promise<DispatchDecision> {
    const decision = evaluateDispatch(
      context.previousStatus,
      context.currentStatus,
      context.lastNotifiedAt,
      context.cooldownInterval,
    );

    if (!decision.shouldNotify) {
      this.logger.debug(
        `Dispatch suppressed for config ${context.configId}: ${decision.reason}`,
      );
      return decision;
    }

    try {
      // Fetch recipients for this config's group + global recipients
      const recipients = await this.resolveRecipients(context.groupId);

      if (recipients.length === 0) {
        this.logger.warn(
          `No recipients found for config ${context.configId}, skipping dispatch`,
        );
        return decision;
      }

      // Fetch and render template
      const message = await this.buildMessage(context, decision.templateType!);

      // Send new message (image+caption)
      const screenshot = await this.screenshotService.capture(
        context.requestUrl,
      );
      await this.sendToRecipients(recipients, message, screenshot);
      await this.sendToTelegram(context.groupId, message, screenshot);

      this.logger.log(
        `Dispatched ${decision.templateType} notification for config ${context.configId} (${context.title})`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to dispatch notification for config ${context.configId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return decision;
  }

  /**
   * Resolves all recipients for a monitoring-enabled config:
   * - MonitoringRecipient (monitoring-specific) with matching groupId or global (groupId = null)
   * - PrtgRecipient (report recipients) with matching groupId or global (groupId = null)
   * - Only enabled recipients
   * - Deduplicates by phoneNumber (monitoring recipients take priority)
   */
  private async resolveRecipients(
    groupId: number,
  ): Promise<ResolvedRecipient[]> {
    // Fetch monitoring-specific recipients
    const monitoringRecipients = await this.prisma.monitoringRecipient.findMany(
      {
        where: {
          enabled: true,
          OR: [{ groupId: groupId }, { groupId: null }],
        },
      },
    );

    // Fetch regular report recipients as fallback/additional
    const reportRecipients = await this.prisma.prtgRecipient.findMany({
      where: {
        enabled: true,
        OR: [{ groupId: groupId }, { groupId: null }],
      },
    });

    // Merge both lists, deduplicate by phoneNumber
    const seen = new Set<string>();
    const result: ResolvedRecipient[] = [];

    for (const r of monitoringRecipients) {
      if (!seen.has(r.phoneNumber)) {
        seen.add(r.phoneNumber);
        result.push({ phoneNumber: r.phoneNumber, targetType: r.targetType });
      }
    }

    for (const r of reportRecipients) {
      if (!seen.has(r.phoneNumber)) {
        seen.add(r.phoneNumber);
        result.push({ phoneNumber: r.phoneNumber, targetType: r.targetType });
      }
    }

    return result;
  }

  /**
   * Fetches the appropriate template from PrtgSetting and renders it with context values.
   * Uses alertMessageTemplate for anomaly alerts and recoveryMessageTemplate for recovery.
   * Falls back to a default template if none is configured.
   */
  private async buildMessage(
    context: DispatchContext,
    templateType: 'anomaly' | 'recovery',
  ): Promise<string> {
    const prtgSetting = await this.prisma.prtgSetting.findFirst({
      where: { id: 1 },
    });

    let templateBody: string;
    if (templateType === 'anomaly') {
      templateBody =
        prtgSetting?.alertMessageTemplate ?? this.getDefaultTemplate('anomaly');
    } else {
      templateBody =
        prtgSetting?.recoveryMessageTemplate ??
        this.getDefaultTemplate('recovery');
    }

    return renderTemplate(templateBody, {
      title: context.title,
      status: context.currentStatus,
      previousStatus: context.previousStatus,
      bitrate:
        context.bitrate !== null
          ? `${(context.bitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`
          : 'N/A',
      trafficIn:
        context.inboundBitrate !== null
          ? `${(context.inboundBitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`
          : 'N/A',
      trafficOut:
        context.outboundBitrate !== null
          ? `${(context.outboundBitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`
          : 'N/A',
      timestamp: context.timestamp.toISOString(),
      time: formatTime(context.timestamp),
      reason: context.reason,
      groupName: context.groupName,
    });
  }

  /**
   * Sends message to all eligible Telegram users.
   */
  private async sendToTelegram(
    groupId: number,
    message: string,
    screenshot: Buffer | null,
  ): Promise<void> {
    const telegramUsers = await this.prisma.telegramUser.findMany({
      where: {
        isVerified: true,
        isBlocked: false,
      },
      include: {
        mutes: {
          where: { groupId },
        },
      },
    });

    const eligibleUsers = telegramUsers.filter(
      (user) => user.mutes.length === 0,
    );

    for (const user of eligibleUsers) {
      try {
        if (screenshot && message) {
          await this.telegramSender.sendImageToChatId(user.telegramId, {
            buffer: screenshot,
            caption: message,
          });
        } else if (screenshot) {
          await this.telegramSender.sendImageToChatId(user.telegramId, {
            buffer: screenshot,
          });
        } else if (message) {
          await this.telegramSender.sendTextToChatId(user.telegramId, message);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send Telegram message to ${user.telegramId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Sends message to all recipients via WhatsApp.
   * If a screenshot is available, sends as image with caption.
   * Otherwise, sends as text-only.
   */
  private async sendToRecipients(
    recipients: ResolvedRecipient[],
    message: string,
    screenshot: Buffer | null,
  ): Promise<void> {
    for (const recipient of recipients) {
      const jid = this.buildJid(recipient.phoneNumber, recipient.targetType);
      if (!jid) {
        this.logger.warn(
          `Could not build JID for recipient: ${recipient.phoneNumber} (${recipient.targetType})`,
        );
        continue;
      }

      try {
        if (screenshot && message) {
          await this.whatsappSender.sendImageToJid(jid, {
            buffer: screenshot,
            caption: message,
          });
        } else if (screenshot) {
          await this.whatsappSender.sendImageToJid(jid, {
            buffer: screenshot,
          });
        } else if (message) {
          await this.whatsappSender.sendTextToJid(jid, message);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send to ${jid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  /**
   * Builds a WhatsApp JID based on the recipient target type.
   * - contact/manual: number@s.whatsapp.net
   * - group: number@g.us
   * - channel: number@newsletter
   */
  private buildJid(
    phoneNumber: string,
    targetType: RecipientTargetType,
  ): string | null {
    const trimmed = phoneNumber.trim();

    // If already a full JID, use as-is
    if (
      trimmed.endsWith('@s.whatsapp.net') ||
      trimmed.endsWith('@g.us') ||
      trimmed.endsWith('@newsletter')
    ) {
      return trimmed;
    }

    const normalized = trimmed.replace(/[^0-9]/g, '');
    if (!normalized) {
      return null;
    }

    switch (targetType) {
      case 'contact':
        return `${normalized}@s.whatsapp.net`;
      case 'group':
        return `${normalized}@g.us`;
      case 'channel':
        return `${normalized}@newsletter`;
      case 'manual':
      default:
        return `${normalized}@s.whatsapp.net`;
    }
  }

  private getDefaultTemplate(type: 'anomaly' | 'recovery'): string {
    if (type === 'anomaly') {
      return [
        'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”',
        'âš ï¸ *ALERT: {status}*',
        'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”',
        'ðŸ“ *{title}*',
        'ðŸ¢ _{groupName}_',
        'â° {time}',
        '📊 Total: ```{bitrate}```',
        '📥 In: ```{trafficIn}```',
        '📤 Out: ```{trafficOut}```',
        '💬 {reason}',
        'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”',
      ].join('\n');
    }
    return [
      'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”',
      'âœ… *PULIH: {title}*',
      'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”',
      'ðŸ¢ _{groupName}_',
      'â° {time}',
      '📊 Total: ```{bitrate}```',
      '📥 In: ```{trafficIn}```',
      '📤 Out: ```{trafficOut}```',
      'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”',
    ].join('\n');
  }
}
