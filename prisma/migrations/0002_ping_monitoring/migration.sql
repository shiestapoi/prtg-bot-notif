CREATE TYPE "PingMonitorStatus" AS ENUM ('UNKNOWN', 'UP', 'RTO');

CREATE TABLE "PingMonitor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 2,
    "pingTimeoutSeconds" INTEGER NOT NULL DEFAULT 1,
    "rtoThresholdSeconds" INTEGER NOT NULL DEFAULT 10,
    "notifyRecovery" BOOLEAN NOT NULL DEFAULT true,
    "alertTemplate" TEXT NOT NULL,
    "recoveryTemplate" TEXT NOT NULL,
    "status" "PingMonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastLatencyMs" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "outageStartedAt" TIMESTAMP(3),
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PingMonitor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PingMonitorRecipient" (
    "pingMonitorId" INTEGER NOT NULL,
    "monitoringRecipientId" INTEGER NOT NULL,
    CONSTRAINT "PingMonitorRecipient_pkey" PRIMARY KEY ("pingMonitorId","monitoringRecipientId")
);

CREATE UNIQUE INDEX "PingMonitor_host_key" ON "PingMonitor"("host");
ALTER TABLE "PingMonitorRecipient" ADD CONSTRAINT "PingMonitorRecipient_pingMonitorId_fkey" FOREIGN KEY ("pingMonitorId") REFERENCES "PingMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PingMonitorRecipient" ADD CONSTRAINT "PingMonitorRecipient_monitoringRecipientId_fkey" FOREIGN KEY ("monitoringRecipientId") REFERENCES "MonitoringRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
