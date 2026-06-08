import { ReceiptPeriod, ScheduleTargetMode } from '@prisma/client';

export interface ReceiptScheduleDto {
  id: number;
  name: string;
  groupId: number | null;
  group?: { id: number; name: string } | null;
  cron: string;
  period: ReceiptPeriod;
  includeDown: boolean;
  includeLowTraffic: boolean;
  targetMode: ScheduleTargetMode;
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ReceiptDispatchSummary {
  scheduleId: number;
  scheduleName: string;
  groupName: string | null;
  targetMode: ScheduleTargetMode;
  result: {
    sentRecipients: number;
    incidentsFound: number;
    skipped: boolean;
  };
}
