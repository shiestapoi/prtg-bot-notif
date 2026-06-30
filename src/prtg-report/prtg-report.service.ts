/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-base-to-string */
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { NocSensitivity } from '@prisma/client';
import axios from 'axios';
import https from 'node:https';
import cron from 'node-cron';
import { chromium } from 'playwright';
import type { Page, Browser, BrowserContext } from 'playwright';
import sharp from 'sharp';
// Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
// import { CookieVaultService } from '../cookie-vault/cookie-vault.service';
import { PrismaService } from '../prisma/prisma.service';
import { MonitoringEventService } from '../monitoring/scheduler/monitoring-event.service';
import { PrtgSettingService } from '../prtg-setting/prtg-setting.service';
import { WhatsappSenderService } from '../whatsapp/whatsapp-sender.service';
import type {
  DispatchSummary,
  PrtgConfigDto,
  PrtgGroupDto,
  PrtgRecipientDto,
  PrtgScheduleDto,
} from './prtg-report.types';

function normalizeInput(value: string | undefined | null) {
  return value?.trim() ?? '';
}

// Cookie tidak dipakai lagi â€” normalizeCookieValue tidak diperlukan
// function normalizeCookieValue(value: string | undefined | null) {
//   const input = normalizeInput(value);
//   if (!input) {
//     return '';
//   }
//   return input;
// }

const allowedTargetTypes = ['contact', 'group', 'channel', 'manual'] as const;
type RecipientTargetType = (typeof allowedTargetTypes)[number];
const allowedScheduleTargetModes = [
  'all',
  'group_only',
  'personal_only',
] as const;
type ScheduleTargetMode = (typeof allowedScheduleTargetModes)[number];
const defaultPrtgImageScale = 2;
const defaultPrtgRenderViewport = { width: 1366, height: 768 };
const defaultPrtgCaptureConcurrency = 10;
const defaultPrtgLoginUrl = 'http://prtg.r1net.id/index.htm';

function normalizeWhatsappIdentifier(value: string) {
  return value
    .replace(/@.*$/, '')
    .replace(/:.*/, '')
    .replace(/[^0-9]/g, '');
}

function inferTargetType(target: string) {
  if (target.endsWith('@g.us')) {
    return 'group';
  }

  if (target.endsWith('@newsletter')) {
    return 'channel';
  }

  if (target.endsWith('@s.whatsapp.net')) {
    return 'contact';
  }

  return 'manual';
}

function resolveTargetType(
  value: string | undefined,
  target: string,
): RecipientTargetType {
  if (value && (allowedTargetTypes as readonly string[]).includes(value)) {
    return value as RecipientTargetType;
  }

  return inferTargetType(target);
}

function resolveScheduleTargetMode(value: unknown): ScheduleTargetMode {
  if (value === undefined || value === null || value === '') {
    return 'all';
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (
      (allowedScheduleTargetModes as readonly string[]).includes(normalized)
    ) {
      return normalized as ScheduleTargetMode;
    }
  }

  throw new BadRequestException(
    'targetMode must be all, group_only, or personal_only.',
  );
}

function normalizeRecipientTarget(
  value: string,
  targetType: RecipientTargetType,
) {
  const target = normalizeInput(value);
  if (!target) {
    return '';
  }

  if (targetType === 'manual') {
    return target.replace(/@.*$/, '').replace(/[^0-9]/g, '');
  }

  return target;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  return results;
}

// â”€â”€â”€ Inline shape for configs that include the group relation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
type ConfigWithGroup = {
  id: number;
  title: string;
  sensorId: number;
  groupId: number;
  group: { name: string; enabled: boolean };
  lastStatus: string;
  // Monitoring notification switches
  notifyDown: boolean;
  notifyNoTraffic: boolean;
  notifyLowTraffic: boolean;
  notifyFlapping: boolean;
  notifyRecovery: boolean;
  // Maintenance
  maintenance: boolean;
  maintenanceLabel: string | null;
};

// Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
// type ActiveCookie = {
//   id: number;
//   value: string;
// };

const prtgUsernameXPath =
  '/html/body/div/div[2]/div/table/tbody/tr[1]/td[1]/form/input[2]';
const prtgPasswordXPath =
  '/html/body/div/div[2]/div/table/tbody/tr[1]/td[1]/form/input[3]';

@Injectable()
export class PrtgReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly whatsappSender: WhatsappSenderService,
    // Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
    // private readonly cookieVault: CookieVaultService,
    private readonly prtgSetting: PrtgSettingService,
    private readonly monitoringEventService: MonitoringEventService,
  ) {}

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Groups
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listGroups(): Promise<PrtgGroupDto[]> {
    const groups = await this.prisma.prtgGroup.findMany({
      orderBy: { name: 'asc' },
    });

    return groups.map((g) => ({
      id: g.id,
      name: g.name,
      enabled: g.enabled,
      createdAt: g.createdAt.toISOString(),
      updatedAt: g.updatedAt.toISOString(),
    }));
  }

  async createGroup(payload: {
    name?: string;
    enabled?: boolean;
  }): Promise<PrtgGroupDto> {
    const name = normalizeInput(payload.name);
    if (!name) {
      throw new BadRequestException('name is required.');
    }

    const existing = await this.prisma.prtgGroup.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      throw new BadRequestException(`Group "${name}" already exists.`);
    }

    const created = await this.prisma.prtgGroup.create({
      data: { name, enabled: payload.enabled ?? true },
    });

    return {
      id: created.id,
      name: created.name,
      enabled: created.enabled,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateGroup(
    id: number,
    payload: { name?: string; enabled?: boolean },
  ): Promise<PrtgGroupDto> {
    const group = await this.prisma.prtgGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('PRTG group not found.');
    }

    const name =
      payload.name !== undefined ? normalizeInput(payload.name) : group.name;
    if (!name) {
      throw new BadRequestException('name is required.');
    }

    if (payload.name !== undefined && name !== group.name) {
      const existing = await this.prisma.prtgGroup.findFirst({
        where: {
          id: { not: id },
          name: { equals: name, mode: 'insensitive' },
        },
      });
      if (existing) {
        throw new BadRequestException(`Group "${name}" already exists.`);
      }
    }

    const updated = await this.prisma.prtgGroup.update({
      where: { id },
      data: { name, enabled: payload.enabled ?? group.enabled },
    });

    return {
      id: updated.id,
      name: updated.name,
      enabled: updated.enabled,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteGroup(id: number): Promise<{ id: number }> {
    const group = await this.prisma.prtgGroup.findUnique({ where: { id } });
    if (!group) {
      throw new NotFoundException('PRTG group not found.');
    }

    const configCount = await this.prisma.prtgConfig.count({
      where: { groupId: id },
    });
    const scheduleCount = await this.prisma.prtgSchedule.count({
      where: { groupId: id },
    });
    const recipientCount = await this.prisma.prtgRecipient.count({
      where: { groupId: id },
    });
    const blockers = [
      configCount ? `${configCount} config(s)` : null,
      scheduleCount ? `${scheduleCount} schedule(s)` : null,
      recipientCount ? `${recipientCount} receipt recipient(s)` : null,
    ].filter(Boolean);

    if (blockers.length > 0) {
      throw new BadRequestException(
        `Cannot delete group "${group.name}" because it is still used by ${blockers.join(', ')}.`,
      );
    }

    await this.prisma.prtgGroup.delete({ where: { id } });
    return { id };
  }

  /**
   * Emergency: Disable ALL groups. Stops all monitoring and schedule dispatch.
   */
  async disableAllGroups(): Promise<{ disabled: number }> {
    const result = await this.prisma.prtgGroup.updateMany({
      where: { enabled: true },
      data: { enabled: false },
    });
    return { disabled: result.count };
  }

  /**
   * Re-enable ALL groups after emergency disable.
   */
  async enableAllGroups(): Promise<{ enabled: number }> {
    const result = await this.prisma.prtgGroup.updateMany({
      where: { enabled: false },
      data: { enabled: true },
    });
    return { enabled: result.count };
  }

  /** Returns names of all enabled groups â€” used by the WhatsApp plugin. */
  async listGroupNames(): Promise<string[]> {
    const groups = await this.prisma.prtgGroup.findMany({
      where: { enabled: true },
      orderBy: { name: 'asc' },
      select: { name: true },
    });

    return groups.map((g) => g.name);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Configs
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listConfigs(): Promise<PrtgConfigDto[]> {
    const configs = await this.prisma.prtgConfig.findMany({
      include: { group: true },
      orderBy: [{ group: { name: 'asc' } }, { title: 'asc' }],
    });

    return configs.map((config) => this.mapConfigToDto(config));
  }

  async createConfig(payload: {
    title?: string;
    sensorId?: number;
    groupId?: number;
    enabled?: boolean;
    cookieId?: number | null;
    monitoringEnabled?: boolean;
    pollingInterval?: number;
    thresholdLow?: number;
    thresholdHigh?: number;
    sensitivity?: NocSensitivity;
    cooldownInterval?: number;
    noTrafficCount?: number;
    flappingWindow?: number;
    flappingCount?: number;
    downCount?: number;
    rollingWindowSize?: number;
    downThreshold?: number;
    notifyDown?: boolean;
    notifyNoTraffic?: boolean;
    notifyLowTraffic?: boolean;
    notifyFlapping?: boolean;
    notifyRecovery?: boolean;
    maintenance?: boolean;
    maintenanceLabel?: string | null;
    minTrafficThreshold?: number;
  }): Promise<PrtgConfigDto> {
    const title = normalizeInput(payload.title);

    if (!title) {
      throw new BadRequestException('title is required.');
    }

    if (!payload.sensorId || payload.sensorId < 1) {
      throw new BadRequestException('sensorId is required and must be >= 1.');
    }

    if (!payload.groupId) {
      throw new BadRequestException('groupId is required.');
    }

    await this.ensureUniqueSensorId(payload.sensorId);

    const group = await this.prisma.prtgGroup.findUnique({
      where: { id: payload.groupId },
    });
    if (!group) {
      throw new NotFoundException(
        `PRTG group with id ${payload.groupId} not found.`,
      );
    }

    const config = await this.prisma.prtgConfig.create({
      include: { group: true },
      data: {
        title,
        sensorId: payload.sensorId,
        groupId: payload.groupId,
        enabled: payload.enabled ?? true,
        cookieId: payload.cookieId ?? null,
        // Monitoring fields
        ...(payload.monitoringEnabled !== undefined && {
          monitoringEnabled: payload.monitoringEnabled,
        }),
        ...(payload.pollingInterval !== undefined && {
          pollingInterval: payload.pollingInterval,
        }),
        ...(payload.thresholdLow !== undefined && {
          thresholdLow: payload.thresholdLow,
        }),
        ...(payload.thresholdHigh !== undefined && {
          thresholdHigh: payload.thresholdHigh,
        }),
        ...(payload.sensitivity !== undefined && {
          sensitivity: payload.sensitivity,
        }),
        ...(payload.cooldownInterval !== undefined && {
          cooldownInterval: payload.cooldownInterval,
        }),
        ...(payload.noTrafficCount !== undefined && {
          noTrafficCount: payload.noTrafficCount,
        }),
        ...(payload.flappingWindow !== undefined && {
          flappingWindow: payload.flappingWindow,
        }),
        ...(payload.flappingCount !== undefined && {
          flappingCount: payload.flappingCount,
        }),
        ...(payload.downCount !== undefined && {
          downCount: payload.downCount,
        }),
        ...(payload.rollingWindowSize !== undefined && {
          rollingWindowSize: payload.rollingWindowSize,
        }),
        ...(payload.downThreshold !== undefined && {
          downThreshold: payload.downThreshold,
        }),
        ...(payload.notifyDown !== undefined && {
          notifyDown: payload.notifyDown,
        }),
        ...(payload.notifyNoTraffic !== undefined && {
          notifyNoTraffic: payload.notifyNoTraffic,
        }),
        ...(payload.notifyLowTraffic !== undefined && {
          notifyLowTraffic: payload.notifyLowTraffic,
        }),
        ...(payload.notifyFlapping !== undefined && {
          notifyFlapping: payload.notifyFlapping,
        }),
        ...(payload.notifyRecovery !== undefined && {
          notifyRecovery: payload.notifyRecovery,
        }),
        ...(payload.maintenance !== undefined && {
          maintenance: payload.maintenance,
        }),
        ...(payload.maintenanceLabel !== undefined && {
          maintenanceLabel: payload.maintenanceLabel,
        }),
        ...(payload.minTrafficThreshold !== undefined && {
          minTrafficThreshold: payload.minTrafficThreshold,
        }),
      },
    });

    this.monitoringEventService.emitConfigUpdated('created', config.id);
    return this.mapConfigToDto(config);
  }

  async updateConfig(
    id: number,
    payload: {
      title?: string;
      sensorId?: number;
      groupId?: number;
      enabled?: boolean;
      cookieId?: number | null;
      monitoringEnabled?: boolean;
      pollingInterval?: number;
      thresholdLow?: number;
      thresholdHigh?: number;
      sensitivity?: NocSensitivity;
      cooldownInterval?: number;
      noTrafficCount?: number;
      flappingWindow?: number;
      flappingCount?: number;
      downCount?: number;
      rollingWindowSize?: number;
      downThreshold?: number;
      notifyDown?: boolean;
      notifyNoTraffic?: boolean;
      notifyLowTraffic?: boolean;
      notifyFlapping?: boolean;
      notifyRecovery?: boolean;
      maintenance?: boolean;
      maintenanceLabel?: string | null;
      minTrafficThreshold?: number;
    },
  ): Promise<PrtgConfigDto> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!config) {
      throw new NotFoundException('PRTG config not found.');
    }

    const title = payload.title ? normalizeInput(payload.title) : config.title;
    const sensorId = payload.sensorId ?? config.sensorId;

    if (sensorId !== config.sensorId) {
      await this.ensureUniqueSensorId(sensorId, id);
    }

    let groupId = config.groupId;
    if (payload.groupId !== undefined && payload.groupId !== groupId) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: payload.groupId },
      });
      if (!group) {
        throw new NotFoundException(
          `PRTG group with id ${payload.groupId} not found.`,
        );
      }
      groupId = payload.groupId;
    }

    const cookieId =
      payload.cookieId !== undefined ? payload.cookieId : config.cookieId;

    const updated = await this.prisma.prtgConfig.update({
      where: { id },
      include: { group: true },
      data: {
        title,
        sensorId,
        groupId,
        enabled: payload.enabled ?? config.enabled,
        cookieId,
        // Monitoring fields
        ...(payload.monitoringEnabled !== undefined && {
          monitoringEnabled: payload.monitoringEnabled,
        }),
        ...(payload.pollingInterval !== undefined && {
          pollingInterval: payload.pollingInterval,
        }),
        ...(payload.thresholdLow !== undefined && {
          thresholdLow: payload.thresholdLow,
        }),
        ...(payload.thresholdHigh !== undefined && {
          thresholdHigh: payload.thresholdHigh,
        }),
        ...(payload.sensitivity !== undefined && {
          sensitivity: payload.sensitivity,
        }),
        ...(payload.cooldownInterval !== undefined && {
          cooldownInterval: payload.cooldownInterval,
        }),
        ...(payload.noTrafficCount !== undefined && {
          noTrafficCount: payload.noTrafficCount,
        }),
        ...(payload.flappingWindow !== undefined && {
          flappingWindow: payload.flappingWindow,
        }),
        ...(payload.flappingCount !== undefined && {
          flappingCount: payload.flappingCount,
        }),
        ...(payload.downCount !== undefined && {
          downCount: payload.downCount,
        }),
        ...(payload.rollingWindowSize !== undefined && {
          rollingWindowSize: payload.rollingWindowSize,
        }),
        ...(payload.downThreshold !== undefined && {
          downThreshold: payload.downThreshold,
        }),
        ...(payload.notifyDown !== undefined && {
          notifyDown: payload.notifyDown,
        }),
        ...(payload.notifyNoTraffic !== undefined && {
          notifyNoTraffic: payload.notifyNoTraffic,
        }),
        ...(payload.notifyLowTraffic !== undefined && {
          notifyLowTraffic: payload.notifyLowTraffic,
        }),
        ...(payload.notifyFlapping !== undefined && {
          notifyFlapping: payload.notifyFlapping,
        }),
        ...(payload.notifyRecovery !== undefined && {
          notifyRecovery: payload.notifyRecovery,
        }),
        ...(payload.maintenance !== undefined && {
          maintenance: payload.maintenance,
        }),
        ...(payload.maintenanceLabel !== undefined && {
          maintenanceLabel: payload.maintenanceLabel,
        }),
        ...(payload.minTrafficThreshold !== undefined && {
          minTrafficThreshold: payload.minTrafficThreshold,
        }),
      },
    });

    this.monitoringEventService.emitConfigUpdated('updated', updated.id);
    return this.mapConfigToDto(updated);
  }

  private mapConfigToDto(config: {
    id: number;
    title: string;
    sensorId: number;
    groupId: number;
    group: { name: string; enabled: boolean };
    enabled: boolean;
    cookieId: number | null;
    monitoringEnabled: boolean;
    pollingInterval: number;
    thresholdLow: number;
    thresholdHigh: number;
    sensitivity: string;
    cooldownInterval: number;
    noTrafficCount: number;
    flappingWindow: number;
    flappingCount: number;
    downCount: number;
    rollingWindowSize: number;
    downThreshold: number;
    notifyDown: boolean;
    notifyNoTraffic: boolean;
    notifyLowTraffic: boolean;
    notifyFlapping: boolean;
    notifyRecovery: boolean;
    lastPolledAt: Date | null;
    lastStatus: string;
    createdAt: Date;
    updatedAt: Date;
  }): PrtgConfigDto {
    return {
      id: config.id,
      title: config.title,
      sensorId: config.sensorId,
      groupId: config.groupId,
      groupName: config.group.name,
      groupEnabled: config.group.enabled,
      enabled: config.enabled,
      cookieId: config.cookieId ?? null,
      monitoringEnabled: config.monitoringEnabled,
      pollingInterval: config.pollingInterval,
      thresholdLow: config.thresholdLow,
      thresholdHigh: config.thresholdHigh,
      sensitivity: config.sensitivity,
      cooldownInterval: config.cooldownInterval,
      noTrafficCount: config.noTrafficCount,
      flappingWindow: config.flappingWindow,
      flappingCount: config.flappingCount,
      downCount: config.downCount,
      rollingWindowSize: config.rollingWindowSize,
      downThreshold: config.downThreshold,
      notifyDown: config.notifyDown,
      notifyNoTraffic: config.notifyNoTraffic,
      notifyLowTraffic: config.notifyLowTraffic,
      notifyFlapping: config.notifyFlapping,
      notifyRecovery: config.notifyRecovery,
      lastPolledAt: config.lastPolledAt?.toISOString() ?? null,
      lastStatus: config.lastStatus,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString(),
    };
  }

  private async ensureUniqueSensorId(sensorId: number, excludeId?: number) {
    const existing = await this.prisma.prtgConfig.findFirst({
      where: {
        sensorId,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
      select: { title: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Sensor ID ${sensorId} already exists in config "${existing.title}".`,
      );
    }
  }

  async deleteConfig(id: number) {
    await this.prisma.prtgConfig.delete({ where: { id } });
    this.monitoringEventService.emitConfigUpdated('deleted', id);
    return { id };
  }

  async deleteConfigHistory(id: number) {
    const deleted = await this.prisma.monitoringHistory.deleteMany({
      where: { configId: id },
    });
    return { id, count: deleted.count };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Cookies â€” DEPRECATED: Cookie tidak dipakai lagi, auth via username/passhash query params
  // Fungsi-fungsi ini tetap ada untuk backward compatibility (WhatsApp plugin, controller)
  // tapi secara internal tidak lagi digunakan untuk auth ke PRTG.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listCookies() {
    const cookies = await this.prisma.prtgCookie.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return cookies.map((cookie) => ({
      id: cookie.id,
      label: cookie.label,
      value: cookie.value,
      isActive: cookie.isActive,
      createdAt: cookie.createdAt.toISOString(),
      updatedAt: cookie.updatedAt.toISOString(),
    }));
  }

  async createCookie(payload: {
    label?: string;
    value?: string;
    isActive?: boolean;
  }) {
    const isActive = payload.isActive ?? true;
    if (isActive) {
      await this.prisma.prtgCookie.updateMany({ data: { isActive: false } });
    }
    const created = await this.prisma.prtgCookie.create({
      data: {
        label: payload.label?.trim() || null,
        value: payload.value?.trim() ?? '',
        isActive,
      },
    });
    return {
      id: created.id,
      label: created.label,
      value: created.value,
      isActive: created.isActive,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateCookie(
    id: number,
    payload: { label?: string; value?: string; isActive?: boolean },
  ) {
    const cookie = await this.prisma.prtgCookie.findUnique({ where: { id } });
    if (!cookie) {
      throw new NotFoundException('PRTG cookie not found.');
    }
    const isActive = payload.isActive ?? cookie.isActive;
    if (isActive && !cookie.isActive) {
      await this.prisma.prtgCookie.updateMany({ data: { isActive: false } });
    }
    const updated = await this.prisma.prtgCookie.update({
      where: { id },
      data: {
        label: payload.label?.trim() ?? cookie.label,
        value: payload.value?.trim() ?? cookie.value,
        isActive,
      },
    });
    return {
      id: updated.id,
      label: updated.label,
      value: updated.value,
      isActive: updated.isActive,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteCookie(id: number) {
    await this.prisma.prtgCookie.delete({ where: { id } });
    return { id };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Settings (delegated to PrtgSettingService)
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getSettings() {
    return this.prtgSetting.getSetting();
  }

  async updateSettings(payload: {
    loginUrl?: string;
    loginUsername?: string | null;
    loginPassword?: string | null;
    messageTemplate?: string;
    alertMessageTemplate?: string;
    recoveryMessageTemplate?: string;
  }) {
    return this.prtgSetting.updateSetting(payload);
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Recipients
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listRecipients(): Promise<PrtgRecipientDto[]> {
    const recipients = await this.prisma.prtgRecipient.findMany({
      include: { group: true },
      orderBy: { createdAt: 'asc' },
    });

    return recipients.map((recipient) => ({
      id: recipient.id,
      label: recipient.label,
      phoneNumber: recipient.phoneNumber,
      targetType: recipient.targetType,
      enabled: recipient.enabled,
      isAdmin: recipient.isAdmin,
      groupId: recipient.groupId ?? null,
      groupName: recipient.group?.name ?? null,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString(),
    }));
  }

  async createRecipient(payload: {
    label?: string;
    phoneNumber?: string;
    targetType?: string;
    enabled?: boolean;
    isAdmin?: boolean;
    groupId?: number | null;
  }): Promise<PrtgRecipientDto> {
    const rawPhoneNumber = normalizeInput(payload.phoneNumber);
    if (!rawPhoneNumber) {
      throw new BadRequestException('phoneNumber is required.');
    }

    const targetType = resolveTargetType(payload.targetType, rawPhoneNumber);
    const phoneNumber = normalizeRecipientTarget(rawPhoneNumber, targetType);
    if (!phoneNumber) {
      throw new BadRequestException('phoneNumber is required.');
    }

    // Validate groupId if provided
    const groupId = payload.groupId ?? null;
    if (groupId !== null) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new NotFoundException(`PRTG group with id ${groupId} not found.`);
      }
      if (!group.enabled) {
        throw new BadRequestException(
          `Cannot create recipient for disabled group "${group.name}".`,
        );
      }
    }

    await this.ensureUniqueRecipientTarget(phoneNumber, groupId);

    const created = await this.prisma.prtgRecipient.create({
      include: { group: true },
      data: {
        label: payload.label?.trim() || null,
        phoneNumber,
        targetType,
        enabled: payload.enabled ?? true,
        isAdmin: payload.isAdmin ?? false,
        groupId,
      },
    });

    return {
      id: created.id,
      label: created.label,
      phoneNumber: created.phoneNumber,
      targetType: created.targetType,
      enabled: created.enabled,
      isAdmin: created.isAdmin,
      groupId: created.groupId ?? null,
      groupName: created.group?.name ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateRecipient(
    id: number,
    payload: {
      label?: string;
      phoneNumber?: string;
      targetType?: string;
      enabled?: boolean;
      isAdmin?: boolean;
      groupId?: number | null;
    },
  ): Promise<PrtgRecipientDto> {
    const recipient = await this.prisma.prtgRecipient.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!recipient) {
      throw new NotFoundException('PRTG recipient not found.');
    }

    const rawPhoneNumber = payload.phoneNumber
      ? normalizeInput(payload.phoneNumber)
      : recipient.phoneNumber;
    const targetType = resolveTargetType(payload.targetType, rawPhoneNumber);
    const phoneNumber = normalizeRecipientTarget(rawPhoneNumber, targetType);
    if (!phoneNumber) {
      throw new BadRequestException('phoneNumber is required.');
    }

    // Only update groupId when caller explicitly passes the key
    const groupId =
      'groupId' in payload ? (payload.groupId ?? null) : recipient.groupId;
    if (groupId !== null && groupId !== recipient.groupId) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new NotFoundException(`PRTG group with id ${groupId} not found.`);
      }
      if (!group.enabled) {
        throw new BadRequestException(
          `Cannot update recipient to disabled group "${group.name}".`,
        );
      }
    }

    await this.ensureUniqueRecipientTarget(phoneNumber, groupId, id);

    const updated = await this.prisma.prtgRecipient.update({
      where: { id },
      include: { group: true },
      data: {
        label: payload.label?.trim() ?? recipient.label,
        phoneNumber,
        targetType,
        enabled: payload.enabled ?? recipient.enabled,
        isAdmin: payload.isAdmin ?? recipient.isAdmin,
        groupId,
      },
    });

    return {
      id: updated.id,
      label: updated.label,
      phoneNumber: updated.phoneNumber,
      targetType: updated.targetType,
      enabled: updated.enabled,
      isAdmin: updated.isAdmin,
      groupId: updated.groupId ?? null,
      groupName: updated.group?.name ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteRecipient(id: number) {
    await this.prisma.prtgRecipient.delete({ where: { id } });
    return { id };
  }

  async isAdminRecipient(senderJid: string | string[]) {
    return this.isAuthorizedWhatsappCommander(senderJid, false);
  }

  async isAuthorizedWhatsappCommander(
    senderJid: string | string[],
    isFromMe: boolean,
  ) {
    if (isFromMe) {
      return true;
    }

    const senderCandidates = (
      Array.isArray(senderJid) ? senderJid : [senderJid]
    )
      .map((jid) => normalizeWhatsappIdentifier(jid))
      .filter(Boolean);

    if (senderCandidates.length === 0) {
      return false;
    }

    const recipients = await this.prisma.prtgRecipient.findMany({
      where: {
        enabled: true,
        isAdmin: true,
        targetType: { in: ['contact', 'manual'] },
      },
      select: { phoneNumber: true },
    });

    return recipients.some((recipient) => {
      const recipientNumber = normalizeWhatsappIdentifier(
        recipient.phoneNumber,
      );
      return senderCandidates.includes(recipientNumber);
    });
  }

  private async ensureUniqueRecipientTarget(
    phoneNumber: string,
    groupId: number | null,
    excludeId?: number,
  ) {
    const existing = await this.prisma.prtgRecipient.findFirst({
      where: {
        phoneNumber,
        groupId,
        ...(excludeId !== undefined ? { id: { not: excludeId } } : {}),
      },
      select: { label: true, phoneNumber: true },
    });

    if (existing) {
      throw new BadRequestException(
        `Receipt target "${existing.label || existing.phoneNumber}" already exists for this PRTG group scope.`,
      );
    }
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Schedules
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async listSchedules(): Promise<PrtgScheduleDto[]> {
    const schedules = await this.prisma.prtgSchedule.findMany({
      include: { group: true },
      orderBy: { createdAt: 'asc' },
    });

    return schedules.map((schedule) => ({
      id: schedule.id,
      name: schedule.name,
      groupId: schedule.groupId,
      groupName: schedule.group?.name ?? null,
      cron: schedule.cron,
      targetMode: schedule.targetMode,
      enabled: schedule.enabled,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    }));
  }

  async createSchedule(payload: {
    name?: string;
    groupId?: number | null;
    cron?: string;
    targetMode?: string;
    enabled?: boolean;
  }): Promise<PrtgScheduleDto> {
    const name = normalizeInput(payload.name);
    const cronExpr = normalizeInput(payload.cron);

    if (!name || !cronExpr) {
      throw new BadRequestException('name and cron are required.');
    }

    if (!cron.validate(cronExpr)) {
      throw new BadRequestException('Invalid cron expression.');
    }

    // null / undefined groupId means "dispatch ALL"
    const groupId = payload.groupId ?? null;

    if (groupId !== null) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new NotFoundException(`PRTG group with id ${groupId} not found.`);
      }
      if (!group.enabled) {
        throw new BadRequestException(
          `Cannot create schedule for disabled group "${group.name}".`,
        );
      }
    }

    const created = await this.prisma.prtgSchedule.create({
      include: { group: true },
      data: {
        name,
        groupId,
        cron: cronExpr,
        targetMode: resolveScheduleTargetMode(payload.targetMode),
        enabled: payload.enabled ?? true,
      },
    });

    return {
      id: created.id,
      name: created.name,
      groupId: created.groupId,
      groupName: created.group?.name ?? null,
      cron: created.cron,
      targetMode: created.targetMode,
      enabled: created.enabled,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async updateSchedule(
    id: number,
    payload: {
      name?: string;
      groupId?: number | null;
      cron?: string;
      targetMode?: string;
      enabled?: boolean;
    },
  ): Promise<PrtgScheduleDto> {
    const schedule = await this.prisma.prtgSchedule.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!schedule) {
      throw new NotFoundException('PRTG schedule not found.');
    }

    const name = payload.name ? normalizeInput(payload.name) : schedule.name;
    const cronExpr = payload.cron
      ? normalizeInput(payload.cron)
      : schedule.cron;

    if (!cron.validate(cronExpr)) {
      throw new BadRequestException('Invalid cron expression.');
    }

    // Only update groupId when the caller explicitly passes the key
    const groupId =
      'groupId' in payload ? (payload.groupId ?? null) : schedule.groupId;

    if (groupId !== null) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new NotFoundException(`PRTG group with id ${groupId} not found.`);
      }
      if (!group.enabled) {
        throw new BadRequestException(
          `Cannot update schedule to disabled group "${group.name}".`,
        );
      }
    }

    const updated = await this.prisma.prtgSchedule.update({
      where: { id },
      include: { group: true },
      data: {
        name,
        groupId,
        cron: cronExpr,
        targetMode:
          payload.targetMode !== undefined
            ? resolveScheduleTargetMode(payload.targetMode)
            : schedule.targetMode,
        enabled: payload.enabled ?? schedule.enabled,
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      groupId: updated.groupId,
      groupName: updated.group?.name ?? null,
      cron: updated.cron,
      targetMode: updated.targetMode,
      enabled: updated.enabled,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteSchedule(id: number) {
    await this.prisma.prtgSchedule.delete({ where: { id } });
    return { id };
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Dispatch
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async dispatchGroup(
    groupId: number | 'ALL',
    targetMode: ScheduleTargetMode = 'all',
  ): Promise<DispatchSummary> {
    const isAll = groupId === 'ALL';

    let displayName: string;
    let configs: ConfigWithGroup[];

    if (isAll) {
      configs = await this.prisma.prtgConfig.findMany({
        where: { enabled: true, group: { enabled: true } },
        include: { group: true },
        orderBy: [{ groupId: 'asc' }, { title: 'asc' }],
      });

      if (configs.length === 0) {
        throw new NotFoundException('No enabled PRTG configs found.');
      }

      displayName = 'ALL';
    } else {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: groupId },
      });
      if (!group) {
        throw new NotFoundException(`PRTG group with id ${groupId} not found.`);
      }
      if (!group.enabled) {
        throw new BadRequestException(
          `PRTG group "${group.name}" is disabled.`,
        );
      }

      configs = await this.prisma.prtgConfig.findMany({
        where: { groupId, enabled: true },
        include: { group: true },
        orderBy: [{ title: 'asc' }],
      });

      if (configs.length === 0) {
        throw new NotFoundException(
          `No enabled PRTG configs found for group "${group.name}".`,
        );
      }

      displayName = group.name;
    }

    return this.dispatchConfigs(
      configs,
      displayName,
      isAll ? null : groupId,
      targetMode,
    );
  }

  async dispatchConfig(id: number): Promise<DispatchSummary> {
    const config = await this.prisma.prtgConfig.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!config || !config.enabled) {
      throw new NotFoundException('PRTG config not found or disabled.');
    }
    if (!config.group.enabled) {
      throw new BadRequestException(
        `PRTG group "${config.group.name}" is disabled.`,
      );
    }

    return this.dispatchConfigs([config], config.group.name, config.groupId);
  }

  /**
   * Convenience method used by the WhatsApp plugin â€” looks up the group by
   * name and then delegates to dispatchGroup(group.id).
   */
  async dispatchGroupByName(name: string): Promise<DispatchSummary> {
    const group = await this.prisma.prtgGroup.findUnique({ where: { name } });
    if (!group) {
      throw new NotFoundException(`PRTG group "${name}" not found.`);
    }
    if (!group.enabled) {
      throw new BadRequestException(`PRTG group "${group.name}" is disabled.`);
    }
    return this.dispatchGroup(group.id);
  }

  private async dispatchConfigs(
    configs: ConfigWithGroup[],
    groupName: string,
    dispatchGroupId: number | null = null,
    targetMode: ScheduleTargetMode = 'all',
  ): Promise<DispatchSummary> {
    const settings = await this.prtgSetting.getSettingRaw();

    const recipientPool = await this.prisma.prtgRecipient.findMany({
      where: {
        enabled: true,
        ...(dispatchGroupId !== null
          ? { OR: [{ groupId: null }, { groupId: dispatchGroupId }] }
          : {}),
      },
    });

    if (recipientPool.length === 0) {
      throw new BadRequestException(
        'No PRTG recipients configured for this group.',
      );
    }

    const browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-zygote',
        '--single-process',
      ],
    });

    let captures: any[];
    try {
      const sharedContext = await browser.newContext({
        ignoreHTTPSErrors: true,
        viewport: this.getPrtgRenderViewport(),
        deviceScaleFactor: this.getPrtgImageScale(),
        extraHTTPHeaders: {
          'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
        },
      });

      captures = await mapWithConcurrency(
        configs,
        this.getPrtgCaptureConcurrency(),
        async (config) => {
          const requestUrl = `http://prtg.r1net.id/graphzoom.htm?id=${config.sensorId}&graphid=1&clgid=&dynamicgraph=1`;
          const imageBuffer = await this.fetchPrtgImage(
            requestUrl,
            settings,
            sharedContext,
          );

          const timeStr = new Date().toLocaleTimeString('id-ID', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Jakarta',
          });

          // Fetch latest monitoring data for traffic info
          let bitrateStr = 'â€”';
          let trafficInStr = 'â€”';
          let trafficOutStr = 'â€”';
          let reasonStr = '';
          const latestHistory = await this.prisma.monitoringHistory.findFirst({
            where: { configId: config.id },
            orderBy: { timestamp: 'desc' },
          });
          if (latestHistory?.totalTrafficBitrate) {
            bitrateStr = `${(latestHistory.totalTrafficBitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`;
          }
          if (latestHistory?.inboundBitrate) {
            trafficInStr = `${(latestHistory.inboundBitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`;
          }
          if (latestHistory?.outboundBitrate) {
            trafficOutStr = `${(latestHistory.outboundBitrate / 1_000_000).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Mbit/s`;
          }
          if (latestHistory?.errorMessage) {
            reasonStr = latestHistory.errorMessage;
          }

          // Determine if this config is in anomaly AND notification for that status is enabled
          const isAnomalyWithNotify = this.isAnomalyWithNotifyEnabled(config);

          let caption: string;
          if (isAnomalyWithNotify) {
            // Use alert template â€” config is in anomaly state and notify is enabled for that status
            const alertTemplate =
              settings.alertMessageTemplate ??
              'â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nâš ï¸ *ALERT: {status}*\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”\nðŸ“ {title}\nðŸ¢ {groupName}\nâ° {time} WIB\nðŸ“Š Traffic Total: {bitrate}\nðŸ“¥ Traffic In: {trafficIn}\nðŸ“¤ Traffic Out: {trafficOut}\nðŸ’¬ {reason}\nâ”â”â”â”â”â”â”â”â”â”â”â”â”â”â”â”';
            caption = alertTemplate
              .replace(/\{title\}/g, config.title)
              .replace(/\{groupName\}/g, config.group.name)
              .replace(/\{groupname\}/g, config.group.name)
              .replace(/\{status\}/g, config.lastStatus)
              .replace(/\{time\}/g, timeStr)
              .replace(/\{bitrate\}/g, bitrateStr)
              .replace(/\{trafficIn\}/g, trafficInStr)
              .replace(/\{trafficOut\}/g, trafficOutStr)
              .replace(
                /\{reason\}/g,
                reasonStr || `Status: ${config.lastStatus}`,
              );
          } else {
            // Normal report template
            const values: Record<string, string> = {
              title: config.title,
              groupname: config.group.name,
              groupName: config.group.name,
              url: requestUrl,
              time: timeStr,
              bitrate: bitrateStr,
              trafficIn: trafficInStr,
              trafficOut: trafficOutStr,
              status: config.lastStatus,
            };
            caption = this.renderMessageTemplate(
              settings.messageTemplate,
              values,
            );
          }

          // Prepend maintenance label if config is in maintenance mode
          if (config.maintenance) {
            const label = config.maintenanceLabel || 'Maintenance';
            caption = `ðŸ”§ *[${label}]* â€” Notifikasi monitoring dinonaktifkan\n\n${caption}`;
          }

          const recipients = this.getRecipientsForConfig(
            recipientPool,
            dispatchGroupId,
            config.groupId,
          );
          const privateRecipients = recipients
            .filter(
              (recipient) =>
                targetMode !== 'group_only' &&
                this.isPrivateRecipient(recipient.targetType),
            )
            .map((recipient) => recipient.phoneNumber);
          const groupRecipients = recipients
            .filter(
              (recipient) =>
                targetMode !== 'personal_only' &&
                !this.isPrivateRecipient(recipient.targetType),
            )
            .map((recipient) => recipient.phoneNumber);

          return {
            buffer: imageBuffer,
            privateCaption: caption,
            groupCaption: caption,
            privateRecipients,
            groupRecipients,
          };
        },
      );
    } finally {
      await browser.close().catch(() => {});
    }
    let sentRecipients = 0;

    for (const capture of captures) {
      if (capture.privateRecipients.length > 0) {
        await this.whatsappSender.sendImageToNumbers(
          capture.privateRecipients,
          {
            buffer: capture.buffer,
            caption: capture.privateCaption,
            mimeType: 'image/png',
          },
        );
        sentRecipients += capture.privateRecipients.length;
      }

      if (capture.groupRecipients.length > 0) {
        await this.whatsappSender.sendImageToNumbers(capture.groupRecipients, {
          buffer: capture.buffer,
          caption: capture.groupCaption,
          mimeType: 'image/png',
        });
        sentRecipients += capture.groupRecipients.length;
      }
    }

    return {
      groupName,
      sentConfigs: configs.length,
      sentRecipients,
    };
  }

  private getRecipientsForConfig<
    T extends {
      phoneNumber: string;
      groupId: number | null;
      targetType: string;
    },
  >(recipients: T[], dispatchGroupId: number | null, configGroupId: number) {
    const matchingRecipients =
      dispatchGroupId === null
        ? recipients.filter(
            (recipient) =>
              recipient.groupId === null || recipient.groupId === configGroupId,
          )
        : recipients;

    return [
      ...new Map(
        matchingRecipients.map((recipient) => [
          recipient.phoneNumber,
          recipient,
        ]),
      ).values(),
    ];
  }

  private isPrivateRecipient(targetType: string) {
    return targetType === 'contact' || targetType === 'manual';
  }

  /**
   * Checks if a config is in anomaly state AND the notification for that specific
   * status is enabled in the config's monitoring switches.
   * Used by schedule dispatch to decide whether to use alert template.
   */
  private isAnomalyWithNotifyEnabled(config: ConfigWithGroup): boolean {
    const status = config.lastStatus;
    if (status === 'NORMAL') return false;

    switch (status) {
      case 'DOWN':
      case 'NO_TRAFFIC':
        return config.notifyDown;
      case 'LOW_TRAFFIC':
        return config.notifyLowTraffic;
      case 'POSSIBLE_FLAPPING':
        return config.notifyFlapping;
      default:
        return false;
    }
  }

  // Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
  // private async getActiveCookie(): Promise<ActiveCookie | null> {
  //   return this.prisma.prtgCookie.findFirst({
  //     where: { isActive: true },
  //     orderBy: { updatedAt: 'desc' },
  //   });
  // }

  private renderMessageTemplate(
    template: string,
    values: Record<string, string>,
  ) {
    return template.replace(/\{([a-z0-9_]+)\}/gi, (match, key) => {
      const value = values[key.toLowerCase()];
      return value ?? match;
    });
  }

  // Cookie tidak dipakai lagi â€” auth sekarang menggunakan username/passhash query params
  // private async saveSingleActiveCookie(cookie: string, labelHint: string) {
  //   const value = normalizeCookieValue(cookie);
  //   if (!value) {
  //     return null;
  //   }
  //
  //   await this.prisma.prtgCookie.updateMany({ data: { isActive: false } });
  //
  //   const existing = await this.prisma.prtgCookie.findFirst({
  //     where: { value },
  //     orderBy: { updatedAt: 'desc' },
  //   });
  //
  //   if (existing) {
  //     const updated = await this.prisma.prtgCookie.update({
  //       where: { id: existing.id },
  //       data: {
  //         label: existing.label || `Cookie ${labelHint}`,
  //         isActive: true,
  //       },
  //     });
  //     return updated.id;
  //   }
  //
  //   const created = await this.prisma.prtgCookie.create({
  //     data: {
  //       label: `Cookie ${labelHint}`,
  //       value,
  //       isActive: true,
  //     },
  //   });
  //
  //   return created.id;
  // }

  private async fetchSvg(
    url: string,
    settings: {
      loginUrl: string;
      loginUsername: string | null;
      loginPassword: string | null;
    },
    sharedContext?: BrowserContext,
  ) {
    const authUrl = this.appendAuthParams(url, settings);
    const isHttps = url.startsWith('https://');
    const httpsAgent = isHttps
      ? new https.Agent({ rejectUnauthorized: false })
      : undefined;

    const response = await axios.get(authUrl, {
      responseType: 'arraybuffer',
      maxRedirects: 5,
      headers: {
        // Cookie tidak dipakai lagi â€” auth via username/passhash query params
        Accept: 'image/svg+xml, text/plain, */*',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      },
      httpsAgent,
      timeout: 30000,
    });

    const buffer = Buffer.from(response.data);
    const contentType = String(
      response.headers['content-type'] ?? '',
    ).toLowerCase();
    const finalUrl =
      response.request?.res?.responseUrl ?? response.request?.path ?? url;

    if (
      contentType.includes('text/html') ||
      this.isPrtgLoginUrl(finalUrl, settings.loginUrl) ||
      this.looksLikeHtml(buffer)
    ) {
      return this.renderPrtgPageToPng(url, settings, sharedContext);
    }

    return buffer;
  }

  private async fetchPrtgImage(
    url: string,
    settings: {
      loginUrl: string;
      loginUsername: string | null;
      loginPassword: string | null;
    },
    sharedContext?: BrowserContext,
  ) {
    if (this.shouldRenderPrtgPage(url)) {
      return this.renderPrtgPageToPng(url, settings, sharedContext);
    }

    const svgBuffer = await this.fetchSvg(url, settings, sharedContext);
    if (this.isPngBuffer(svgBuffer)) {
      return svgBuffer;
    }

    return this.renderSvgToPng(svgBuffer);
  }

  private shouldRenderPrtgPage(url: string) {
    try {
      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      return path.endsWith('.htm') || path.endsWith('.html');
    } catch {
      return !url.toLowerCase().includes('.svg');
    }
  }

  private async renderPrtgPageToPng(
    url: string,
    settings: {
      loginUrl: string;
      loginUsername: string | null;
      loginPassword: string | null;
    },
    sharedContext?: BrowserContext,
  ) {
    const authUrl = this.appendAuthParams(url, settings);

    let browser: Browser | null = null;
    let context = sharedContext;
    let page: Page | null = null;

    try {
      if (!context) {
        browser = await chromium.launch({
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-zygote',
            '--single-process',
          ],
        });
        context = await browser.newContext({
          ignoreHTTPSErrors: true,
          viewport: this.getPrtgRenderViewport(),
          deviceScaleFactor: this.getPrtgImageScale(),
          extraHTTPHeaders: {
            'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
          },
        });
      }

      page = await context.newPage();
      await page.goto(authUrl, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);

      if (await this.isPrtgLoginPage(page, settings.loginUrl)) {
        throw new BadRequestException(
          'PRTG masih menampilkan halaman login; screenshot dibatalkan. Periksa username/passhash di pengaturan.',
        );
      }

      return await page.screenshot({
        type: 'png',
        fullPage: false,
      });
    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      if (browser) {
        await browser.close().catch(() => {});
      }
    }
  }

  // Cookie tidak dipakai lagi â€” loginAndRefreshCookie tidak diperlukan
  // Auth sekarang menggunakan username/passhash query params
  // private async loginAndRefreshCookie(
  //   page: Page,
  //   context: BrowserContext,
  //   originalUrl: string,
  //   cookieId: number,
  // ) {
  //   const settings = await this.prtgSetting.getSettingRaw();
  //   if (!settings.loginUsername || !settings.loginPassword) {
  //     throw new BadRequestException(
  //       'PRTG auto-login credentials are not configured.',
  //     );
  //   }
  //
  //   await page
  //     .locator(`xpath=${prtgUsernameXPath}`)
  //     .fill(settings.loginUsername, { timeout: 10000 });
  //   await page
  //     .locator(`xpath=${prtgPasswordXPath}`)
  //     .fill(settings.loginPassword, { timeout: 10000 });
  //
  //   await Promise.all([
  //     page
  //       .waitForURL(
  //         (targetUrl) =>
  //           !this.isPrtgLoginUrl(targetUrl.toString(), settings.loginUrl),
  //         { timeout: 45000 },
  //       )
  //       .catch(() => undefined),
  //     page.keyboard.press('Enter'),
  //   ]);
  //   await page
  //     .waitForLoadState('networkidle', { timeout: 45000 })
  //     .catch(() => undefined);
  //   await page.waitForTimeout(1500);
  //
  //   const cookies = await context.cookies(originalUrl);
  //   const cookieValue = cookies
  //     .filter((cookie) => cookie.name && cookie.value)
  //     .map((cookie) => `${cookie.name}=${cookie.value}`)
  //     .join('; ');
  //
  //   if (!cookieValue) {
  //     throw new BadRequestException(
  //       'PRTG login succeeded but returned no cookies.',
  //     );
  //   }
  //
  //   await this.prisma.prtgCookie.update({
  //     where: { id: cookieId },
  //     data: {
  //       value: cookieValue,
  //       isActive: true,
  //       label: `Auto login ${new Date().toISOString()}`,
  //     },
  //   });
  //
  //   await context.setExtraHTTPHeaders({
  //     Cookie: cookieValue,
  //     'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
  //     'User-Agent':
  //       'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
  //   });
  //
  //   await page.goto(originalUrl, { waitUntil: 'networkidle', timeout: 45000 });
  //   await page.waitForTimeout(1500);
  //
  //   if (await this.isPrtgLoginPage(page, settings.loginUrl)) {
  //     throw new BadRequestException(
  //       'PRTG auto-login did not reach the target URL.',
  //     );
  //   }
  //
  //   return cookieValue;
  // }

  private async isPrtgLoginPage(page: Page, configuredLoginUrl: string) {
    if (this.isPrtgLoginUrl(page.url(), configuredLoginUrl)) {
      return true;
    }

    const username = page.locator(`xpath=${prtgUsernameXPath}`);
    const password = page.locator(`xpath=${prtgPasswordXPath}`);
    const hasUsername =
      (await username.count()) > 0 && (await username.first().isVisible());
    const hasPassword =
      (await password.count()) > 0 && (await password.first().isVisible());

    if (hasUsername && hasPassword) {
      return true;
    }

    const loginForm = page
      .locator('form input[type="password"], input[name*="pass" i]')
      .first();
    return (await loginForm.count()) > 0 && (await loginForm.isVisible());
  }

  private isPrtgLoginUrl(
    value: string | undefined | null,
    configuredLoginUrl = defaultPrtgLoginUrl,
  ) {
    if (!value) {
      return false;
    }

    try {
      const url = new URL(value);
      const loginUrl = new URL(configuredLoginUrl || defaultPrtgLoginUrl);
      return (
        url.hostname.toLowerCase() === loginUrl.hostname.toLowerCase() &&
        url.pathname.toLowerCase() === loginUrl.pathname.toLowerCase()
      );
    } catch {
      return value.toLowerCase().includes('prtg.r1net.id/index.htm');
    }
  }

  /**
   * Appends username/passhash query params to the given URL for PRTG auth.
   */
  private appendAuthParams(
    url: string,
    settings: { loginUsername: string | null; loginPassword: string | null },
  ): string {
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}username=${encodeURIComponent(settings.loginUsername ?? '')}&passhash=${encodeURIComponent(settings.loginPassword ?? '')}`;
  }

  private looksLikeHtml(buffer: Buffer) {
    const head = buffer
      .toString('utf8', 0, Math.min(buffer.length, 512))
      .trimStart();
    return /^<!doctype html|^<html\b|<form\b/i.test(head);
  }

  private isPngBuffer(buffer: Buffer) {
    return (
      buffer.length > 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47
    );
  }

  private async renderSvgToPng(svgBuffer: Buffer) {
    const scale = this.getPrtgImageScale();
    const size = this.readSvgSize(svgBuffer);
    const image = sharp(svgBuffer, { density: 72 * scale });

    if (size) {
      image.resize({
        width: Math.round(size.width * scale),
        height: Math.round(size.height * scale),
        fit: 'fill',
      });
    }

    return image
      .flatten({ background: '#ffffff' })
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toBuffer();
  }

  private getPrtgImageScale() {
    const scale = Number(process.env.PRTG_IMAGE_SCALE ?? defaultPrtgImageScale);
    if (!Number.isFinite(scale) || scale < 1) {
      return defaultPrtgImageScale;
    }

    return Math.min(Math.round(scale), 4);
  }

  private getPrtgCaptureConcurrency() {
    const concurrency = Number(
      process.env.PRTG_CAPTURE_CONCURRENCY ?? defaultPrtgCaptureConcurrency,
    );
    if (!Number.isFinite(concurrency) || concurrency < 1) {
      return defaultPrtgCaptureConcurrency;
    }

    return Math.round(concurrency);
  }

  private getPrtgRenderViewport() {
    const width = Number(
      process.env.PRTG_RENDER_WIDTH ?? defaultPrtgRenderViewport.width,
    );
    const height = Number(
      process.env.PRTG_RENDER_HEIGHT ?? defaultPrtgRenderViewport.height,
    );

    return {
      width:
        Number.isFinite(width) && width >= 800
          ? Math.min(Math.round(width), 3000)
          : defaultPrtgRenderViewport.width,
      height:
        Number.isFinite(height) && height >= 400
          ? Math.min(Math.round(height), 2000)
          : defaultPrtgRenderViewport.height,
    };
  }

  private readSvgSize(svgBuffer: Buffer) {
    const svg = svgBuffer.toString('utf8', 0, Math.min(svgBuffer.length, 2048));
    const width = this.readSvgLength(svg.match(/\bwidth=["']?([0-9.]+)/i)?.[1]);
    const height = this.readSvgLength(
      svg.match(/\bheight=["']?([0-9.]+)/i)?.[1],
    );

    if (width && height) {
      return { width, height };
    }

    const viewBox = svg.match(
      /\bviewBox=["']\s*[0-9.-]+\s+[0-9.-]+\s+([0-9.]+)\s+([0-9.]+)/i,
    );
    const viewBoxWidth = this.readSvgLength(viewBox?.[1]);
    const viewBoxHeight = this.readSvgLength(viewBox?.[2]);

    if (viewBoxWidth && viewBoxHeight) {
      return { width: viewBoxWidth, height: viewBoxHeight };
    }

    return null;
  }

  private readSvgLength(value: string | undefined) {
    if (!value) {
      return null;
    }

    const length = Number(value);
    return Number.isFinite(length) && length > 0 ? length : null;
  }
}
