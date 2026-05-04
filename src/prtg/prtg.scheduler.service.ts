import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import cron, { type ScheduledTask } from 'node-cron';
import { PrismaService } from '../prisma/prisma.service';
import { PrtgService } from './prtg.service';

interface ScheduledEntry {
  cron: string;
  targetMode: string;
  task: ScheduledTask;
}

@Injectable()
export class PrtgSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrtgSchedulerService.name);
  private readonly tasks = new Map<number, ScheduledEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly prtgService: PrtgService,
  ) {}

  async onModuleInit() {
    await this.syncSchedules();
  }

  async onModuleDestroy() {
    for (const entry of this.tasks.values()) {
      entry.task.stop();
    }
    this.tasks.clear();
  }

  async syncSchedules() {
    let schedules: Prisma.PrtgScheduleGetPayload<object>[];
    try {
      schedules = await this.prisma.prtgSchedule.findMany();
    } catch (error) {
      if (this.isMissingScheduleTableError(error)) {
        this.logger.warn(
          'Skipping PRTG schedule sync because table "PrtgSchedule" does not exist. Run `npx prisma migrate deploy` or `npx prisma migrate dev`, then restart the app.',
        );
        return;
      }

      throw error;
    }

    const activeSchedules = schedules.filter((schedule) => schedule.enabled);
    const activeIds = new Set(activeSchedules.map((schedule) => schedule.id));

    for (const [id, entry] of this.tasks.entries()) {
      if (!activeIds.has(id)) {
        entry.task.stop();
        this.tasks.delete(id);
      }
    }

    for (const schedule of activeSchedules) {
      if (!cron.validate(schedule.cron)) {
        this.logger.warn(
          `Skipping schedule ${schedule.id} (${schedule.name}) due to invalid cron: ${schedule.cron}`,
        );
        continue;
      }

      const existing = this.tasks.get(schedule.id);
      if (
        existing &&
        existing.cron === schedule.cron &&
        existing.targetMode === schedule.targetMode
      ) {
        continue;
      }

      if (existing) {
        existing.task.stop();
        this.tasks.delete(schedule.id);
      }

      const task = cron.schedule(schedule.cron, async () => {
        try {
          await this.prtgService.dispatchGroup(
            schedule.groupId ?? 'ALL',
            schedule.targetMode,
          );
          this.logger.log(`PRTG schedule ${schedule.name} dispatched.`);
        } catch (error) {
          this.logger.error(
            `PRTG schedule ${schedule.name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

      this.tasks.set(schedule.id, {
        cron: schedule.cron,
        targetMode: schedule.targetMode,
        task,
      });
    }
  }

  private isMissingScheduleTableError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
      return false;
    }

    return (
      error.code === 'P2021' &&
      typeof error.meta?.modelName === 'string' &&
      error.meta.modelName === 'PrtgSchedule'
    );
  }
}
