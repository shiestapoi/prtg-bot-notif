import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { UpdateSettingDto } from './dto/update-setting.dto';

export interface PrtgSettingDto {
  loginUrl: string;
  loginUsername: string | null;
  hasLoginPassword: boolean;
  hasLoginPasshash: boolean;
  messageTemplate: string;
  alertMessageTemplate: string;
  recoveryMessageTemplate: string;
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
      hasLoginPasshash: Boolean(settings.loginPasshash),
      messageTemplate: settings.messageTemplate,
      alertMessageTemplate: settings.alertMessageTemplate,
      recoveryMessageTemplate: settings.recoveryMessageTemplate,
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
      loginPasshash?: string | null;
      messageTemplate: string;
      alertMessageTemplate: string;
      recoveryMessageTemplate: string;
    } = {
      loginUrl,
      loginUsername: normalizeInput(dto.loginUsername) || null,
      messageTemplate,
      alertMessageTemplate,
      recoveryMessageTemplate,
    };

    if (dto.loginPassword !== undefined) {
      const password = normalizeInput(dto.loginPassword);
      data.loginPassword = password || null;
    } else {
      data.loginPassword = current.loginPassword;
    }

    if ((dto as any).loginPasshash !== undefined) {
      const passhash = normalizeInput((dto as any).loginPasshash);
      data.loginPasshash = passhash || null;
    } else {
      data.loginPasshash = current.loginPasshash;
    }

    const updated = await this.prisma.prtgSetting.update({
      where: { id: 1 },
      data,
    });

    return {
      loginUrl: updated.loginUrl,
      loginUsername: updated.loginUsername,
      hasLoginPassword: Boolean(updated.loginPassword),
      hasLoginPasshash: Boolean(updated.loginPasshash),
      messageTemplate: updated.messageTemplate,
      alertMessageTemplate: updated.alertMessageTemplate,
      recoveryMessageTemplate: updated.recoveryMessageTemplate,
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
