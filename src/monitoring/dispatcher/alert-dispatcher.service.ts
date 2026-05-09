import { Injectable, Logger } from '@nestjs/common';
import { NocStatus, type RecipientTargetType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { WhatsappSenderService, type SentMessageKey } from '../../whatsapp/whatsapp-sender.service';
import { ScreenshotService } from './screenshot.service';

// ─── Interfaces ──────────────────────────────────────────────────────────────

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

/** Tracks a sent message for potential editing */
interface SentMessageRecord {
  keys: Map<string, SentMessageKey>; // jid → message key
  sentAt: Date;
  configId: number;
}

interface ResolvedRecipient {
  phoneNumber: string;
  targetType: RecipientTargetType;
}

// ─── Pure Function: Dispatch Decision Logic ──────────────────────────────────

/**
 * Pure function that evaluates whether a notification should be dispatched.
 * No side effects — can be tested independently.
 */
export function evaluateDispatch(
  previousStatus: NocStatus,
  currentStatus: NocStatus,
  lastNotifiedAt: Date | null,
  cooldownInterval: number,
): DispatchDecision {
  const now = Date.now();
  const inCooldown =
    lastNotifiedAt !== null &&
    now - lastNotifiedAt.getTime() < cooldownInterval * 1000;

  // Recovery: anomaly → NORMAL
  if (previousStatus !== NocStatus.NORMAL && currentStatus === NocStatus.NORMAL) {
    return { shouldNotify: true, reason: 'recovered', templateType: 'recovery' };
  }

  // New anomaly: NORMAL → anomaly
  if (previousStatus === NocStatus.NORMAL && currentStatus !== NocStatus.NORMAL) {
    return { shouldNotify: true, reason: 'new_anomaly', templateType: 'anomaly' };
  }

  // Status change during anomaly (e.g., LOW_TRAFFIC → DOWN)
  if (
    previousStatus !== currentStatus &&
    currentStatus !== NocStatus.NORMAL &&
    !inCooldown
  ) {
    return { shouldNotify: true, reason: 'status_escalation', templateType: 'anomaly' };
  }

  // Same anomaly status, within cooldown
  if (inCooldown) {
    return { shouldNotify: false, reason: 'cooldown_active', templateType: null };
  }

  return { shouldNotify: false, reason: 'no_change', templateType: null };
}

// ─── Template Rendering ──────────────────────────────────────────────────────

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

// ─── Service ─────────────────────────────────────────────────────────────────

@Injectable()
export class AlertDispatcherService {
  private readonly logger = new Logger(AlertDispatcherService.name);

  /** Tracks last sent message per config for edit-instead-of-new-message logic */
  private readonly sentMessages: Map<number, SentMessageRecord> = new Map();

  /** If a new notification for the same config comes within this window, edit the old message */
  private readonly EDIT_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsappSenderService,
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

      // Check if we should EDIT a recent message instead of sending a new one
      const recentSent = this.sentMessages.get(context.configId);
      const now = Date.now();
      const shouldEdit = recentSent && (now - recentSent.sentAt.getTime()) < this.EDIT_WINDOW_MS;

      if (shouldEdit && recentSent) {
        // Edit the existing message (text/caption only — image stays the same)
        for (const recipient of recipients) {
          const jid = this.buildJid(recipient.phoneNumber, recipient.targetType);
          if (!jid) continue;
          const savedKey = recentSent.keys.get(jid);
          if (savedKey) {
            try {
              await this.whatsappSender.editMessage(jid, savedKey, message);
            } catch {
              // Edit failed — fall through to send new
            }
          }
        }
        // Update the timestamp
        recentSent.sentAt = new Date();
        this.logger.log(
          `Edited existing notification for config ${context.configId} (${context.title})`,
        );
      } else {
        // Send new message (image+caption)
        const screenshot = await this.screenshotService.capture(context.requestUrl);
        const sentKeys = await this.sendToRecipientsWithKeys(recipients, message, screenshot);

        // Track sent message keys for future edits
        this.sentMessages.set(context.configId, {
          keys: sentKeys,
          sentAt: new Date(),
          configId: context.configId,
        });

        this.logger.log(
          `Dispatched ${decision.templateType} notification for config ${context.configId} (${context.title}) to ${recipients.length} recipients`,
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to dispatch notification for config ${context.configId}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    return decision;
  }

  /**
   * Resolves all recipients for a monitoring-enabled config:
   * - Group-scoped recipients (PrtgRecipient with matching groupId)
   * - Global recipients (PrtgRecipient with groupId = null)
   * - Only enabled recipients
   */
  private async resolveRecipients(
    groupId: number,
  ): Promise<ResolvedRecipient[]> {
    const recipients = await this.prisma.prtgRecipient.findMany({
      where: {
        enabled: true,
        OR: [{ groupId: groupId }, { groupId: null }],
      },
    });

    return recipients.map((r) => ({
      phoneNumber: r.phoneNumber,
      targetType: r.targetType,
    }));
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
   * Sends a message to all resolved recipients via WhatsApp.
   * If a screenshot is available, sends as image with caption.
   * Otherwise, sends as text-only.
   */
  private async sendToRecipients(
    recipients: ResolvedRecipient[],
    message: string,
    screenshot: Buffer | null,
  ): Promise<void> {
    await this.sendToRecipientsWithKeys(recipients, message, screenshot);
  }

  /**
   * Sends message to all recipients and returns the message keys for each JID.
   * Used for tracking sent messages for future edits.
   */
  private async sendToRecipientsWithKeys(
    recipients: ResolvedRecipient[],
    message: string,
    screenshot: Buffer | null,
  ): Promise<Map<string, SentMessageKey>> {
    const keys = new Map<string, SentMessageKey>();

    for (const recipient of recipients) {
      const jid = this.buildJid(recipient.phoneNumber, recipient.targetType);
      if (!jid) {
        this.logger.warn(
          `Could not build JID for recipient: ${recipient.phoneNumber} (${recipient.targetType})`,
        );
        continue;
      }

      try {
        let key: SentMessageKey | null = null;
        if (screenshot && message) {
          key = await this.whatsappSender.sendImageToJid(jid, {
            buffer: screenshot,
            caption: message,
          });
        } else if (screenshot) {
          key = await this.whatsappSender.sendImageToJid(jid, {
            buffer: screenshot,
          });
        } else if (message) {
          key = await this.whatsappSender.sendTextToJid(jid, message);
        }
        if (key) {
          keys.set(jid, key);
        }
      } catch (error) {
        this.logger.error(
          `Failed to send to ${jid}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return keys;
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
        '━━━━━━━━━━━━━━━━',
        '⚠️ *ALERT: {status}*',
        '━━━━━━━━━━━━━━━━',
        '📍 *{title}*',
        '🏢 _{groupName}_',
        '⏰ {time}',
        '📊 Total: ```{bitrate}```',
        '📥 In: ```{trafficIn}```',
        '📤 Out: ```{trafficOut}```',
        '💬 {reason}',
        '━━━━━━━━━━━━━━━━',
      ].join('\n');
    }
    return [
      '━━━━━━━━━━━━━━━━',
      '✅ *PULIH: {title}*',
      '━━━━━━━━━━━━━━━━',
      '🏢 _{groupName}_',
      '⏰ {time}',
      '📊 Total: ```{bitrate}```',
      '📥 In: ```{trafficIn}```',
      '📤 Out: ```{trafficOut}```',
      '━━━━━━━━━━━━━━━━',
    ].join('\n');
  }
}
