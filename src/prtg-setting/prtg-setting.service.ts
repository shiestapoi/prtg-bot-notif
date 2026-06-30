import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingDto } from './dto/update-setting.dto';

export interface PrtgSettingDto {
  loginUrl: string;
  loginUsername: string | null;
  hasLoginPassword: boolean;
  messageTemplate: string;
  alertMessageTemplate: string;
  recoveryMessageTemplate: string;
  tvUIVersion: string;
  reportUIVersion: string;
  telegramBotToken: string | null;
  telegramSecretCode: string | null;
  createdAt: string;
  updatedAt: string;
}

const defaultPrtgLoginUrl = 'http://prtg.r1net.id/index.htm';
const defaultMessageTemplate = '{title}\nGroup: {groupname}';
const defaultAlertMessageTemplate =
  '⚠️ {status} — {title}\nGroup: {groupName}\nWaktu: {time}\nAlasan: {reason}';
const defaultRecoveryMessageTemplate =
  '✅ Pulih — {title}\nGroup: {groupName}\nWaktu: {time}';

function normalizeInput(value: string | undefined | null) {
  return value?.trim() ?? '';
}

@Injectable()
export class PrtgSettingService {
  constructor(private readonly prisma: PrismaService) {}

  async getSetting(): Promise<PrtgSettingDto> {
    const settings = await this.ensureSettings();
    return {
      loginUrl: settings.loginUrl,
      loginUsername: settings.loginUsername,
      hasLoginPassword: Boolean(settings.loginPassword),
      messageTemplate: settings.messageTemplate,
      alertMessageTemplate: settings.alertMessageTemplate,
      recoveryMessageTemplate: settings.recoveryMessageTemplate,
      tvUIVersion: settings.tvUIVersion,
      reportUIVersion: settings.reportUIVersion,
      telegramBotToken: settings.telegramBotToken,
      telegramSecretCode: settings.telegramSecretCode,
      createdAt: settings.createdAt.toISOString(),
      updatedAt: settings.updatedAt.toISOString(),
    };
  }

  async updateSetting(dto: UpdateSettingDto): Promise<PrtgSettingDto> {
    const current = await this.ensureSettings();

    const loginUrl = normalizeInput(dto.loginUrl) || current.loginUrl;
    const messageTemplate =
      normalizeInput(dto.messageTemplate) || current.messageTemplate;
    const alertMessageTemplate =
      normalizeInput(dto.alertMessageTemplate) || current.alertMessageTemplate;
    const recoveryMessageTemplate =
      normalizeInput(dto.recoveryMessageTemplate) ||
      current.recoveryMessageTemplate;

    const data: {
      loginUrl: string;
      loginUsername: string | null;
      loginPassword?: string | null;
      messageTemplate: string;
      alertMessageTemplate: string;
      recoveryMessageTemplate: string;
      tvUIVersion?: string;
      reportUIVersion?: string;
      telegramBotToken?: string | null;
      telegramSecretCode?: string | null;
    } = {
      loginUrl,
      loginUsername: normalizeInput(dto.loginUsername) || null,
      messageTemplate,
      alertMessageTemplate,
      recoveryMessageTemplate,
    };

    if (dto.tvUIVersion !== undefined) {
      data.tvUIVersion = dto.tvUIVersion;
    }

    if (dto.reportUIVersion !== undefined) {
      data.reportUIVersion = dto.reportUIVersion;
    }

    if (dto.telegramBotToken !== undefined) {
      data.telegramBotToken = dto.telegramBotToken;
    }

    if (dto.telegramSecretCode !== undefined) {
      data.telegramSecretCode = dto.telegramSecretCode;
    }

    if (dto.loginPassword !== undefined) {
      const password = normalizeInput(dto.loginPassword);
      data.loginPassword = password || null;
    } else {
      data.loginPassword = current.loginPassword;
    }

    const updated = await this.prisma.prtgSetting.update({
      where: { id: 1 },
      data,
    });

    return {
      loginUrl: updated.loginUrl,
      loginUsername: updated.loginUsername,
      hasLoginPassword: Boolean(updated.loginPassword),
      messageTemplate: updated.messageTemplate,
      alertMessageTemplate: updated.alertMessageTemplate,
      recoveryMessageTemplate: updated.recoveryMessageTemplate,
      tvUIVersion: updated.tvUIVersion,
      reportUIVersion: updated.reportUIVersion,
      telegramBotToken: updated.telegramBotToken,
      telegramSecretCode: updated.telegramSecretCode,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Returns the raw setting record (including password) for internal use
   * by other modules (e.g., report login automation).
   */
  async getSettingRaw() {
    return this.ensureSettings();
  }

  private async ensureSettings() {
    return this.prisma.prtgSetting.upsert({
      where: { id: 1 },
      update: {},
      create: {
        id: 1,
        loginUrl: defaultPrtgLoginUrl,
        messageTemplate: defaultMessageTemplate,
        alertMessageTemplate: defaultAlertMessageTemplate,
        recoveryMessageTemplate: defaultRecoveryMessageTemplate,
      },
    });
  }
}
