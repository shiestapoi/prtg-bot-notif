import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePingMonitorDto,
  UpdatePingMonitorDto,
} from '../dto/ping-monitor.dto';

export const DEFAULT_PING_ALERT_TEMPLATE =
  '*ALERT RTO*\n{label} ({host}) RTO dalam {outageSeconds} detik yang lalu.\nWaktu: {time}';
export const DEFAULT_PING_RECOVERY_TEMPLATE =
  '*PULIH*\n{label} ({host}) kembali terhubung.\nLatency: {latencyMs} ms\nWaktu: {time}';

@Injectable()
export class PingMonitorService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const monitors = await this.prisma.pingMonitor.findMany({
      orderBy: { id: 'asc' },
      include: { recipients: true },
    });
    return monitors.map((monitor) => ({
      ...monitor,
      recipientIds: monitor.recipients.map((item) => item.pingRecipientId),
      recipients: undefined,
    }));
  }

  async findOne(id: number) {
    const monitor = await this.prisma.pingMonitor.findUnique({
      where: { id },
      include: { recipients: true },
    });
    if (!monitor) throw new NotFoundException('Ping monitor not found.');
    return {
      ...monitor,
      recipientIds: monitor.recipients.map((item) => item.pingRecipientId),
      recipients: undefined,
    };
  }

  async create(dto: CreatePingMonitorDto) {
    return this.save(undefined, dto);
  }

  async update(id: number, dto: UpdatePingMonitorDto) {
    await this.findOne(id);
    return this.save(id, dto);
  }

  async remove(id: number) {
    await this.findOne(id);
    await this.prisma.pingMonitor.delete({ where: { id } });
    return { id };
  }

  private async save(id: number | undefined, dto: UpdatePingMonitorDto) {
    const name = dto.name?.trim();
    const host = dto.host?.trim();
    if (id === undefined && (!name || !host)) {
      throw new BadRequestException('name and host are required.');
    }
    if (dto.name !== undefined && !name) {
      throw new BadRequestException('name is required.');
    }
    if (dto.host !== undefined && !host) {
      throw new BadRequestException('host is required.');
    }

    const recipientIds = dto.recipientIds;
    if (recipientIds?.length) {
      const count = await this.prisma.pingRecipient.count({
        where: { id: { in: recipientIds } },
      });
      if (count !== recipientIds.length) {
        throw new BadRequestException(
          'One or more ping recipients do not exist.',
        );
      }
    }

    const data = {
      ...(name !== undefined ? { name } : {}),
      ...(host !== undefined ? { host } : {}),
      ...(dto.enabled !== undefined ? { enabled: dto.enabled } : {}),
      ...(dto.intervalSeconds !== undefined
        ? { intervalSeconds: dto.intervalSeconds }
        : {}),
      ...(dto.pingTimeoutSeconds !== undefined
        ? { pingTimeoutSeconds: dto.pingTimeoutSeconds }
        : {}),
      ...(dto.rtoThresholdCount !== undefined
        ? { rtoThresholdCount: dto.rtoThresholdCount }
        : {}),
      ...(dto.notificationCooldownSeconds !== undefined
        ? { notificationCooldownSeconds: dto.notificationCooldownSeconds }
        : {}),
      ...(dto.maintenance !== undefined
        ? { maintenance: dto.maintenance }
        : {}),
      ...(dto.maintenanceLabel !== undefined
        ? { maintenanceLabel: dto.maintenanceLabel?.trim() || null }
        : {}),
      ...(dto.notifyRecovery !== undefined
        ? { notifyRecovery: dto.notifyRecovery }
        : {}),
      ...(dto.alertTemplate !== undefined
        ? {
            alertTemplate:
              dto.alertTemplate.trim() || DEFAULT_PING_ALERT_TEMPLATE,
          }
        : {}),
      ...(dto.recoveryTemplate !== undefined
        ? {
            recoveryTemplate:
              dto.recoveryTemplate.trim() || DEFAULT_PING_RECOVERY_TEMPLATE,
          }
        : {}),
      ...(recipientIds !== undefined
        ? {
            recipients: {
              deleteMany: {},
              create: recipientIds.map((pingRecipientId) => ({
                pingRecipientId,
              })),
            },
          }
        : {}),
    };

    if (id === undefined) {
      return this.prisma.pingMonitor.create({
        data: {
          name: name!,
          host: host!,
          alertTemplate:
            dto.alertTemplate?.trim() || DEFAULT_PING_ALERT_TEMPLATE,
          recoveryTemplate:
            dto.recoveryTemplate?.trim() || DEFAULT_PING_RECOVERY_TEMPLATE,
          ...data,
        },
      });
    }
    await this.prisma.pingMonitor.update({ where: { id }, data });
    return this.findOne(id);
  }
}
