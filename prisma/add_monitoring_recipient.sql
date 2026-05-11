-- Add MonitoringRecipient table (additive only, no data loss)
CREATE TABLE IF NOT EXISTS "MonitoringRecipient" (
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

-- Add foreign key to PrtgGroup
ALTER TABLE "MonitoringRecipient"
    ADD CONSTRAINT "MonitoringRecipient_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
