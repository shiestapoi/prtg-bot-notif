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

CREATE TABLE "PingMonitorRecipient_new" (
    "pingMonitorId" INTEGER NOT NULL,
    "pingRecipientId" INTEGER NOT NULL,
    CONSTRAINT "PingMonitorRecipient_new_pkey" PRIMARY KEY ("pingMonitorId","pingRecipientId")
);

WITH copied AS (
    INSERT INTO "PingRecipient" ("label", "phoneNumber", "targetType", "enabled", "createdAt", "updatedAt")
    SELECT DISTINCT ON (mr."phoneNumber") mr."label", mr."phoneNumber", mr."targetType", mr."enabled", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    FROM "PingMonitorRecipient" pmr
    JOIN "MonitoringRecipient" mr ON mr."id" = pmr."monitoringRecipientId"
    ORDER BY mr."phoneNumber", mr."id"
    RETURNING "id", "phoneNumber"
)
INSERT INTO "PingMonitorRecipient_new" ("pingMonitorId", "pingRecipientId")
SELECT pmr."pingMonitorId", pr."id"
FROM "PingMonitorRecipient" pmr
JOIN "MonitoringRecipient" mr ON mr."id" = pmr."monitoringRecipientId"
JOIN "PingRecipient" pr ON pr."phoneNumber" = mr."phoneNumber"
ON CONFLICT DO NOTHING;

DROP TABLE "PingMonitorRecipient";

ALTER TABLE "PingMonitorRecipient_new" RENAME TO "PingMonitorRecipient";

ALTER TABLE "PingMonitorRecipient" ADD CONSTRAINT "PingMonitorRecipient_pingMonitorId_fkey" FOREIGN KEY ("pingMonitorId") REFERENCES "PingMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PingMonitorRecipient" ADD CONSTRAINT "PingMonitorRecipient_pingRecipientId_fkey" FOREIGN KEY ("pingRecipientId") REFERENCES "PingRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
