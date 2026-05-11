import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

const allowedTargetTypes = ['contact', 'group', 'channel', 'manual'] as const;
type TargetType = (typeof allowedTargetTypes)[number];

function normalizeInput(value: string | undefined | null) {
  return value?.trim() ?? '';
}

function inferTargetType(target: string): TargetType {
  if (target.endsWith('@g.us')) return 'group';
  if (target.endsWith('@newsletter')) return 'channel';
  if (target.endsWith('@s.whatsapp.net')) return 'contact';
  return 'manual';
}

function resolveTargetType(value: string | undefined, target: string): TargetType {
  if (value && (allowedTargetTypes as readonly string[]).includes(value)) {
    return value as TargetType;
  }
  return inferTargetType(target);
}

@Injectable()
export class MonitoringRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const recipients = await this.prisma.monitoringRecipient.findMany({
      orderBy: { createdAt: 'desc' },
      include: { group: { select: { name: true } } },
    });

    return recipients.map((r) => ({
      id: r.id,
      label: r.label,
      phoneNumber: r.phoneNumber,
      targetType: r.targetType,
      enabled: r.enabled,
      groupId: r.groupId,
      groupName: r.group?.name ?? null,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async create(payload: {
    label?: string;
    phoneNumber?: string;
    targetType?: string;
    enabled?: boolean;
    groupId?: number;
  }) {
    const phoneNumber = normalizeInput(payload.phoneNumber);
    if (!phoneNumber) {
      throw new BadRequestException('phoneNumber is required.');
    }

    const targetType = resolveTargetType(payload.targetType, phoneNumber);

    // Validate group exists if provided
    if (payload.groupId) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: payload.groupId },
      });
      if (!group) {
        throw new NotFoundException(`Group with id ${payload.groupId} not found.`);
      }
    }

    const created = await this.prisma.monitoringRecipient.create({
      data: {
        label: normalizeInput(payload.label) || null,
        phoneNumber,
        targetType,
        enabled: payload.enabled ?? true,
        groupId: payload.groupId ?? null,
      },
      include: { group: { select: { name: true } } },
    });

    return {
      id: created.id,
      label: created.label,
      phoneNumber: created.phoneNumber,
      targetType: created.targetType,
      enabled: created.enabled,
      groupId: created.groupId,
      groupName: created.group?.name ?? null,
      createdAt: created.createdAt.toISOString(),
      updatedAt: created.updatedAt.toISOString(),
    };
  }

  async update(
    id: number,
    payload: {
      label?: string;
      phoneNumber?: string;
      targetType?: string;
      enabled?: boolean;
      groupId?: number | null;
    },
  ) {
    const existing = await this.prisma.monitoringRecipient.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Monitoring recipient not found.');
    }

    const phoneNumber = payload.phoneNumber
      ? normalizeInput(payload.phoneNumber)
      : existing.phoneNumber;

    const targetType = payload.targetType
      ? resolveTargetType(payload.targetType, phoneNumber)
      : existing.targetType;

    // Validate group exists if provided
    if (payload.groupId !== undefined && payload.groupId !== null) {
      const group = await this.prisma.prtgGroup.findUnique({
        where: { id: payload.groupId },
      });
      if (!group) {
        throw new NotFoundException(`Group with id ${payload.groupId} not found.`);
      }
    }

    const updated = await this.prisma.monitoringRecipient.update({
      where: { id },
      data: {
        label: payload.label !== undefined ? (normalizeInput(payload.label) || null) : existing.label,
        phoneNumber,
        targetType,
        enabled: payload.enabled ?? existing.enabled,
        groupId: payload.groupId !== undefined ? payload.groupId : existing.groupId,
      },
      include: { group: { select: { name: true } } },
    });

    return {
      id: updated.id,
      label: updated.label,
      phoneNumber: updated.phoneNumber,
      targetType: updated.targetType,
      enabled: updated.enabled,
      groupId: updated.groupId,
      groupName: updated.group?.name ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async remove(id: number) {
    const existing = await this.prisma.monitoringRecipient.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Monitoring recipient not found.');
    }

    await this.prisma.monitoringRecipient.delete({ where: { id } });
    return { id };
  }
}
