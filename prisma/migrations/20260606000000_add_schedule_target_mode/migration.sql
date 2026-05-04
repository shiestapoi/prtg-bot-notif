CREATE TYPE "ScheduleTargetMode" AS ENUM ('all', 'group_only', 'personal_only');

ALTER TABLE "PrtgSchedule"
ADD COLUMN "targetMode" "ScheduleTargetMode" NOT NULL DEFAULT 'all';
