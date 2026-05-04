-- CreateEnum
CREATE TYPE "RecipientTargetType" AS ENUM ('contact', 'group', 'channel', 'manual');

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
    "requestUrl" TEXT NOT NULL,
    "groupId" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "cookieId" INTEGER,
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
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrtgSchedule" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "groupId" INTEGER,
    "cron" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PrtgSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "PrtgGroup_name_key" ON "PrtgGroup"("name");

-- AddForeignKey
ALTER TABLE "PrtgConfig" ADD CONSTRAINT "PrtgConfig_cookieId_fkey"
    FOREIGN KEY ("cookieId") REFERENCES "PrtgCookie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrtgConfig" ADD CONSTRAINT "PrtgConfig_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrtgSchedule" ADD CONSTRAINT "PrtgSchedule_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
