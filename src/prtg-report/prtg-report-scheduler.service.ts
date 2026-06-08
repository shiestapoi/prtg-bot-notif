import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import cron, { type ScheduledTask } from 'node-cron';
import { PrismaService } from '../prisma/prisma.service';
import { PrtgReportService } from './prtg-report.service';
import type { ScheduleDispatchSummary } from './prtg-report.types';

interface ScheduledEntry {
  cron: string;
  targetMode: string;
  task: ScheduledTask;
}

@Injectable()
export class PrtgReportSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrtgReportSchedulerService.name);
  private readonly tasks = new Map<number, ScheduledEntry>();
  private readonly runningSchedules = new Set<number>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly prtgReportService: PrtgReportService,
  ) {}

  async onModuleInit() {
    try {
      await this.syncSchedules();
    } catch (error) {
      this.logger.warn(
        `PRTG schedule sync skipped; database may not be ready: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async onModuleDestroy() {
    for (const entry of this.tasks.values()) {
      entry.task.stop();
    }
    this.tasks.clear();
  }

  async syncSchedules() {
    let schedules: Prisma.PrtgScheduleGetPayload<{
      include: { group: true };
    }>[];
    try {
      schedules = await this.prisma.prtgSchedule.findMany({
        include: { group: true },
      });
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
          await this.dispatchScheduleRecord(schedule, 'cron');
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

  async dispatchSchedule(id: number): Promise<ScheduleDispatchSummary> {
    const schedule = await this.prisma.prtgSchedule.findUnique({
      where: { id },
      include: { group: true },
    });
    if (!schedule) {
      throw new NotFoundException('PRTG schedule not found.');
    }
    if (!schedule.enabled) {
      throw new BadRequestException(
        `PRTG schedule "${schedule.name}" is disabled.`,
      );
    }

    return this.dispatchScheduleRecord(schedule, 'manual');
  }

  async dispatchEnabledSchedules(): Promise<ScheduleDispatchSummary[]> {
    const schedules = await this.prisma.prtgSchedule.findMany({
      where: { enabled: true },
      include: { group: true },
      orderBy: { createdAt: 'asc' },
    });
    if (schedules.length === 0) {
      throw new NotFoundException('No enabled PRTG schedules found.');
    }

    const results: ScheduleDispatchSummary[] = [];
    for (const schedule of schedules) {
      results.push(await this.dispatchScheduleRecord(schedule, 'manual'));
    }

    return results;
  }

  private async dispatchScheduleRecord(
    schedule: Prisma.PrtgScheduleGetPayload<{ include: { group: true } }>,
    source: 'cron' | 'manual',
  ): Promise<ScheduleDispatchSummary> {
    if (this.runningSchedules.has(schedule.id)) {
      // If triggered manually while cron is running, just skip with info message
      if (source === 'manual') {
        return {
          scheduleId: schedule.id,
          scheduleName: schedule.name,
          groupName: schedule.group?.name ?? null,
          targetMode: schedule.targetMode,
          result: {
            sentRecipients: 0,
            totalConfigs: 0,
            skippedConfigs: 0,
          } as any,
        };
      }
      // Cron trigger while already running — skip silently
      this.logger.warn(`Schedule "${schedule.name}" skipped (already running)`);
      return {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        groupName: schedule.group?.name ?? null,
        targetMode: schedule.targetMode,
        result: {
          sentRecipients: 0,
          totalConfigs: 0,
          skippedConfigs: 0,
        } as any,
      };
    }

    this.runningSchedules.add(schedule.id);
    try {
      const result = await this.prtgReportService.dispatchGroup(
        schedule.groupId ?? 'ALL',
        schedule.targetMode,
      );
      this.logger.log(
        `PRTG schedule ${schedule.name} dispatched by ${source}.`,
      );
      return {
        scheduleId: schedule.id,
        scheduleName: schedule.name,
        groupName: schedule.group?.name ?? null,
        targetMode: schedule.targetMode,
        result,
      };
    } finally {
      this.runningSchedules.delete(schedule.id);
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
