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

function resolveTargetType(
  value: string | undefined,
  target: string,
): TargetType {
  if (value && (allowedTargetTypes as readonly string[]).includes(value)) {
    return value as TargetType;
  }
  return inferTargetType(target);
}

@Injectable()
export class PingRecipientService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const recipients = await this.prisma.pingRecipient.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return recipients.map((recipient) => ({
      ...recipient,
      createdAt: recipient.createdAt.toISOString(),
      updatedAt: recipient.updatedAt.toISOString(),
    }));
  }

  async create(payload: {
    label?: string;
    phoneNumber?: string;
    targetType?: string;
    enabled?: boolean;
  }) {
    const phoneNumber = normalizeInput(payload.phoneNumber);
    if (!phoneNumber) throw new BadRequestException('phoneNumber is required.');

    const created = await this.prisma.pingRecipient.create({
      data: {
        label: normalizeInput(payload.label) || null,
        phoneNumber,
        targetType: resolveTargetType(payload.targetType, phoneNumber),
        enabled: payload.enabled ?? true,
      },
    });
    return {
      ...created,
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
    },
  ) {
    const existing = await this.prisma.pingRecipient.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Ping recipient not found.');

    const phoneNumber = payload.phoneNumber
      ? normalizeInput(payload.phoneNumber)
      : existing.phoneNumber;

    const updated = await this.prisma.pingRecipient.update({
      where: { id },
      data: {
        label:
          payload.label !== undefined
            ? normalizeInput(payload.label) || null
            : existing.label,
        phoneNumber,
        targetType: payload.targetType
          ? resolveTargetType(payload.targetType, phoneNumber)
          : existing.targetType,
        enabled: payload.enabled ?? existing.enabled,
      },
    });
    return {
      ...updated,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async remove(id: number) {
    const existing = await this.prisma.pingRecipient.findUnique({
      where: { id },
    });
    if (!existing) throw new NotFoundException('Ping recipient not found.');
    await this.prisma.pingRecipient.delete({ where: { id } });
    return { id };
  }
}
