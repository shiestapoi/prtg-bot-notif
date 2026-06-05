ALTER TABLE "PingMonitor"
ADD COLUMN "notificationCooldownSeconds" INTEGER NOT NULL DEFAULT 3600,
ADD COLUMN "maintenance" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "maintenanceLabel" TEXT;
