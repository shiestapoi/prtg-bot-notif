ALTER TABLE "PrtgSetting"
  ADD COLUMN "privateMessageTemplate" TEXT NOT NULL DEFAULT '{title}
Group: {groupname}',
  ADD COLUMN "groupMessageTemplate" TEXT NOT NULL DEFAULT '{title}
Group: {groupname}';

UPDATE "PrtgSetting"
SET
  "privateMessageTemplate" = COALESCE(NULLIF("messageTemplate", ''), '{title}
Group: {groupname}'),
  "groupMessageTemplate" = COALESCE(NULLIF("messageTemplate", ''), '{title}
Group: {groupname}');
