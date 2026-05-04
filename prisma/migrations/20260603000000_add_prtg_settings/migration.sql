CREATE TABLE "PrtgSetting" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "loginUrl" TEXT NOT NULL DEFAULT 'http://prtg.r1net.id/index.htm',
    "loginUsername" TEXT,
    "loginPassword" TEXT,
    "messageTemplate" TEXT NOT NULL DEFAULT '{title}
Group: {groupname}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgSetting_pkey" PRIMARY KEY ("id")
);

INSERT INTO "PrtgSetting" ("id", "loginUrl", "messageTemplate", "updatedAt")
VALUES (1, 'http://prtg.r1net.id/index.htm', '{title}
Group: {groupname}', CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
