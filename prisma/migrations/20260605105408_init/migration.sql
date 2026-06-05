-- CreateEnum
CREATE TYPE "PingMonitorStatus" AS ENUM ('UNKNOWN', 'UP', 'RTO');

-- CreateEnum
CREATE TYPE "RecipientTargetType" AS ENUM ('contact', 'group', 'channel', 'manual');

-- CreateEnum
CREATE TYPE "ScheduleTargetMode" AS ENUM ('all', 'group_only', 'personal_only');

-- CreateEnum
CREATE TYPE "NocStatus" AS ENUM ('NORMAL', 'LOW_TRAFFIC', 'NO_TRAFFIC', 'HIGH_UTILIZATION', 'POSSIBLE_FLAPPING', 'DOWN');

-- CreateEnum
CREATE TYPE "NocSensitivity" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrtgCookie" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "value" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgCookie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrtgSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "loginUrl" TEXT NOT NULL DEFAULT 'http://prtg.r1net.id/index.htm',
    "loginUsername" TEXT,
    "loginPassword" TEXT,
    "messageTemplate" TEXT NOT NULL DEFAULT '{title}
Group: {groupname}',
    "alertMessageTemplate" TEXT NOT NULL DEFAULT '⚠️ {status} — {title}
Group: {groupName}
Waktu: {time}
Alasan: {reason}',
    "recoveryMessageTemplate" TEXT NOT NULL DEFAULT '✅ Pulih — {title}
Group: {groupName}
Waktu: {time}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrtgGroup" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrtgConfig" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "sensorId" INTEGER NOT NULL,
    "groupId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cookieId" INTEGER,
    "monitoringEnabled" BOOLEAN NOT NULL DEFAULT false,
    "pollingInterval" INTEGER NOT NULL DEFAULT 60,
    "thresholdLow" DOUBLE PRECISION NOT NULL DEFAULT 30.0,
    "thresholdHigh" DOUBLE PRECISION NOT NULL DEFAULT 90.0,
    "sensitivity" "NocSensitivity" NOT NULL DEFAULT 'MEDIUM',
    "cooldownInterval" INTEGER NOT NULL DEFAULT 300,
    "noTrafficCount" INTEGER NOT NULL DEFAULT 3,
    "flappingWindow" INTEGER NOT NULL DEFAULT 600,
    "flappingCount" INTEGER NOT NULL DEFAULT 4,
    "downCount" INTEGER NOT NULL DEFAULT 3,
    "rollingWindowSize" INTEGER NOT NULL DEFAULT 10,
    "notifyDown" BOOLEAN NOT NULL DEFAULT true,
    "notifyNoTraffic" BOOLEAN NOT NULL DEFAULT true,
    "notifyLowTraffic" BOOLEAN NOT NULL DEFAULT true,
    "notifyFlapping" BOOLEAN NOT NULL DEFAULT true,
    "notifyRecovery" BOOLEAN NOT NULL DEFAULT true,
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceLabel" TEXT,
    "minTrafficThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10.0,
    "lastPolledAt" TIMESTAMP(3),
    "lastStatus" "NocStatus" NOT NULL DEFAULT 'NORMAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrtgRecipient" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "targetType" "RecipientTargetType" NOT NULL DEFAULT 'manual',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "isAdmin" BOOLEAN NOT NULL DEFAULT false,
    "groupId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringRecipient" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "targetType" "RecipientTargetType" NOT NULL DEFAULT 'manual',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "groupId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoringRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PingRecipient" (
    "id" SERIAL NOT NULL,
    "label" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "targetType" "RecipientTargetType" NOT NULL DEFAULT 'manual',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PingRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PingMonitor" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "intervalSeconds" INTEGER NOT NULL DEFAULT 2,
    "pingTimeoutSeconds" INTEGER NOT NULL DEFAULT 1,
    "rtoThresholdSeconds" INTEGER NOT NULL DEFAULT 10,
    "notificationCooldownSeconds" INTEGER NOT NULL DEFAULT 3600,
    "maintenance" BOOLEAN NOT NULL DEFAULT false,
    "maintenanceLabel" TEXT,
    "notifyRecovery" BOOLEAN NOT NULL DEFAULT true,
    "alertTemplate" TEXT NOT NULL DEFAULT '*ALERT RTO*
{label} ({host}) mengalami RTO dalam {outageSeconds} detik yang lalu.
Waktu: {time}',
    "recoveryTemplate" TEXT NOT NULL DEFAULT '*PULIH*
{label} ({host}) kembali terhubung.
Latency: {latencyMs} ms
Waktu: {time}',
    "status" "PingMonitorStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastLatencyMs" DOUBLE PRECISION,
    "lastCheckedAt" TIMESTAMP(3),
    "outageStartedAt" TIMESTAMP(3),
    "lastAlertAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PingMonitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PingMonitorRecipient" (
    "pingMonitorId" INTEGER NOT NULL,
    "pingRecipientId" INTEGER NOT NULL,

    CONSTRAINT "PingMonitorRecipient_pkey" PRIMARY KEY ("pingMonitorId","pingRecipientId")
);

-- CreateTable
CREATE TABLE "PrtgSchedule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" INTEGER,
    "cron" TEXT NOT NULL,
    "targetMode" "ScheduleTargetMode" NOT NULL DEFAULT 'all',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoringHistory" (
    "id" SERIAL NOT NULL,
    "configId" INTEGER NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "status" "NocStatus" NOT NULL,
    "totalTrafficBytes" DOUBLE PRECISION,
    "totalTrafficBitrate" DOUBLE PRECISION,
    "inboundBytes" DOUBLE PRECISION,
    "inboundBitrate" DOUBLE PRECISION,
    "outboundBytes" DOUBLE PRECISION,
    "outboundBitrate" DOUBLE PRECISION,
    "errorPercent" DOUBLE PRECISION,
    "coveragePercent" DOUBLE PRECISION,
    "rawInboundBitrate" DOUBLE PRECISION,
    "rawOutboundBitrate" DOUBLE PRECISION,
    "errorMessage" TEXT,
    "rawResponse" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MonitoringHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PrtgGroup_name_key" ON "PrtgGroup"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PrtgConfig_sensorId_key" ON "PrtgConfig"("sensorId");

-- CreateIndex
CREATE UNIQUE INDEX "PingMonitor_host_key" ON "PingMonitor"("host");

-- CreateIndex
CREATE INDEX "MonitoringHistory_configId_timestamp_idx" ON "MonitoringHistory"("configId", "timestamp");

-- CreateIndex
CREATE INDEX "MonitoringHistory_status_idx" ON "MonitoringHistory"("status");

-- AddForeignKey
ALTER TABLE "PrtgConfig" ADD CONSTRAINT "PrtgConfig_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrtgConfig" ADD CONSTRAINT "PrtgConfig_cookieId_fkey" FOREIGN KEY ("cookieId") REFERENCES "PrtgCookie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrtgRecipient" ADD CONSTRAINT "PrtgRecipient_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringRecipient" ADD CONSTRAINT "MonitoringRecipient_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PingMonitorRecipient" ADD CONSTRAINT "PingMonitorRecipient_pingMonitorId_fkey" FOREIGN KEY ("pingMonitorId") REFERENCES "PingMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PingMonitorRecipient" ADD CONSTRAINT "PingMonitorRecipient_pingRecipientId_fkey" FOREIGN KEY ("pingRecipientId") REFERENCES "PingRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrtgSchedule" ADD CONSTRAINT "PrtgSchedule_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoringHistory" ADD CONSTRAINT "MonitoringHistory_configId_fkey" FOREIGN KEY ("configId") REFERENCES "PrtgConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
