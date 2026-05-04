-- Add groupId to PrtgRecipient (nullable, FK → PrtgGroup with SetNull on delete)
ALTER TABLE "PrtgRecipient" ADD COLUMN "groupId" INTEGER;

ALTER TABLE "PrtgRecipient"
  ADD CONSTRAINT "PrtgRecipient_groupId_fkey"
  FOREIGN KEY ("groupId")
  REFERENCES "PrtgGroup"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
