/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/require-await */
import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ReceiptReportService } from './receipt-report.service';
import cron, { type ScheduledTask } from 'node-cron';

interface ScheduledEntry {
  cron: string;
  task: ScheduledTask;
}

@Injectable()
export class ReceiptSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReceiptSchedulerService.name);
  private readonly tasks = new Map<number, ScheduledEntry>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly receiptReportService: ReceiptReportService,
  ) {}

  async onModuleInit() {
    try {
      await this.syncSchedules();
    } catch (error) {
      this.logger.warn(
        `Receipt schedule sync skipped; database may not be ready: ${error instanceof Error ? error.message : String(error)}`,
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
    const schedules = await this.prisma.receiptSchedule.findMany({
      include: { group: true },
    });

    const activeSchedules = schedules.filter((schedule) => schedule.enabled);
    const activeIds = new Set(activeSchedules.map((schedule) => schedule.id));

    // Remove inactive or deleted schedules
    for (const [id, entry] of this.tasks.entries()) {
      if (!activeIds.has(id)) {
        entry.task.stop();
        this.tasks.delete(id);
      }
    }

    // Add or update active schedules
    for (const schedule of activeSchedules) {
      if (!cron.validate(schedule.cron)) {
        this.logger.warn(
          `Skipping receipt schedule ${schedule.id} (${schedule.name}) due to invalid cron: ${schedule.cron}`,
        );
        continue;
      }

      const existing = this.tasks.get(schedule.id);
      if (existing && existing.cron === schedule.cron) {
        continue; // Unchanged
      }

      if (existing) {
        existing.task.stop();
        this.tasks.delete(schedule.id);
      }

      const task = cron.schedule(schedule.cron, async () => {
        try {
          await this.receiptReportService.dispatchSchedule(schedule);
          this.logger.log(`Receipt schedule ${schedule.name} dispatched.`);
        } catch (error) {
          this.logger.error(
            `Receipt schedule ${schedule.name} failed: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      });

      this.tasks.set(schedule.id, {
        cron: schedule.cron,
        task,
      });
    }
  }

  async dispatchManual(id: number) {
    const schedule = await this.prisma.receiptSchedule.findUnique({
      where: { id },
      include: { group: true },
    });

    if (!schedule) {
      throw new Error(`Receipt schedule with ID ${id} not found.`);
    }

    return this.receiptReportService.dispatchSchedule(schedule);
  }
}
