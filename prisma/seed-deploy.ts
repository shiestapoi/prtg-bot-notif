/**
 * Deploy seed — safe for production/Heroku.
 * Uses upsert/check-before-insert so it won't destroy existing data.
 * Only inserts defaults if they don't already exist.
 *
 * Run with: npx tsx prisma/seed-deploy.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { createPostgresPoolConfig } from '../src/prisma/postgres-options';

const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Running deploy seed (safe check-before-insert mode)...');

  // ─── PrtgSetting (upsert — never overwrite existing) ─────────────────────
  const existingSetting = await prisma.prtgSetting.findFirst();
  if (!existingSetting) {
    await prisma.prtgSetting.create({
      data: {
        loginUrl: process.env.PRTG_LOGIN_URL ?? 'http://prtg.r1net.id/index.htm',
        loginUsername: process.env.PRTG_USERNAME ?? 'noc',
        loginPassword: process.env.PRTG_PASSWORD ?? '',
        messageTemplate: '*{title}*\n🏢 _{groupname}_\n⏰ {time}\n📊 Traffic: ```{bitrate}```',
        alertMessageTemplate: [
          '━━━━━━━━━━━━━━━━',
          '⚠️ *ALERT: {status}*',
          '━━━━━━━━━━━━━━━━',
          '📍 *{title}*',
          '🏢 _{groupName}_',
          '⏰ {time}',
          '📊 Total: ```{bitrate}```',
          '📥 In: ```{trafficIn}```',
          '📤 Out: ```{trafficOut}```',
          '💬 {reason}',
          '━━━━━━━━━━━━━━━━',
        ].join('\n'),
        recoveryMessageTemplate: [
          '━━━━━━━━━━━━━━━━',
          '✅ *PULIH: {title}*',
          '━━━━━━━━━━━━━━━━',
          '🏢 _{groupName}_',
          '⏰ {time}',
          '📊 Total: ```{bitrate}```',
          '📥 In: ```{trafficIn}```',
          '📤 Out: ```{trafficOut}```',
          '━━━━━━━━━━━━━━━━',
        ].join('\n'),
        receiptMessageTemplate: '*{title}*\nGROUP : {groupName}\n{details}',
      },
    });
    console.log('✓ PrtgSetting created');
  } else {
    console.log('  PrtgSetting already exists, skipping');
  }

  // ─── Default admin user ───────────────────────────────────────────────────
  const adminUsername = 'admin';
  const adminPassword = 'admin123';

  await prisma.user.upsert({
    where: { username: adminUsername },
    create: {
      username: adminUsername,
      passwordHash: await bcrypt.hash(adminPassword, 12),
    },
    update: {},
  });
  console.log(`✓ User "${adminUsername}" ensured`);

  // ─── Default groups ───────────────────────────────────────────────────────
  const defaultGroups = [
    { id: 2, name: 'RAWANGKAO' },
    { id: 3, name: 'DUMAI' },
    { id: 4, name: 'SEI PAKNING' },
    { id: 5, name: 'BUNGARAYA' },
    { id: 6, name: 'PERAWANG' },
    { id: 7, name: 'SIAK KOTA' },
    { id: 9, name: 'PEKANBARU' },
    { id: 10, name: 'RUMBAI' },
  ];

  for (const group of defaultGroups) {
    const existingGroup = await prisma.prtgGroup.findUnique({
      where: { name: group.name },
    });
    if (!existingGroup) {
      const existingById = await prisma.prtgGroup.findUnique({
        where: { id: group.id },
      });
      if (existingById) {
        await prisma.prtgGroup.create({
          data: { name: group.name, enabled: true },
        });
      } else {
        await prisma.prtgGroup.create({
          data: { id: group.id, name: group.name, enabled: true },
        });
      }
    }
  }
  console.log(`✓ ${defaultGroups.length} groups ensured`);

  // ─── Default configs ──────────────────────────────────────────────────────
  const defaultConfigs = [
    { id: 1, title: 'LL SOLNET', sensorId: 2669, groupId: 7 },
    { id: 2, title: 'LL INDOSAT', sensorId: 2624, groupId: 7 },
    { id: 3, title: 'LL TELKOM', sensorId: 2659, groupId: 4 },
    { id: 4, title: 'LL INDOSAT', sensorId: 2658, groupId: 4 },
    { id: 5, title: 'LL SOLNET', sensorId: 2719, groupId: 6 },
    { id: 6, title: 'LL INDOSAT', sensorId: 2717, groupId: 2 },
    { id: 7, title: 'LL XL', sensorId: 2588, groupId: 5 },
    { id: 8, title: 'LL MORA', sensorId: 2511, groupId: 3 },
    { id: 39, title: 'LL INDOSAT', sensorId: 2484, groupId: 3 },
    { id: 40, title: 'LL INDOSAT', sensorId: 2657, groupId: 6 },
    { id: 55, title: 'IPTX SOLNET', sensorId: 2242, groupId: 9 },
    { id: 56, title: 'IPTX TELKOM', sensorId: 2249, groupId: 9 },
    { id: 57, title: 'CDN H3I', sensorId: 2506, groupId: 9 },
    { id: 58, title: 'RUMBAI TRAFFIC', sensorId: 2411, groupId: 10 },
    { id: 88, title: 'LL INDOSAT', sensorId: 2721, groupId: 5 },
  ];

  for (const config of defaultConfigs) {
    const existingConfig = await prisma.prtgConfig.findUnique({
      where: { sensorId: config.sensorId },
    });
    if (!existingConfig) {
      const existingById = await prisma.prtgConfig.findUnique({
        where: { id: config.id },
      });
      const data = {
        title: config.title,
        sensorId: config.sensorId,
        groupId: config.groupId,
        enabled: true,
        monitoringEnabled: true,
        notifyDown: true,
        notifyNoTraffic: false,
        notifyLowTraffic: true,
        notifyFlapping: false,
        notifyRecovery: false,
      };
      if (existingById) {
        await prisma.prtgConfig.create({ data });
      } else {
        await prisma.prtgConfig.create({
          data: { ...data, id: config.id },
        });
      }
    }
  }
  console.log(`✓ ${defaultConfigs.length} configs ensured`);

  // ─── Default recipients ───────────────────────────────────────────────────
  const defaultRecipients = [
    {
      id: 43,
      label: 'Swenson Simanjuntak',
      phoneNumber: '6282179438863@s.whatsapp.net',
      targetType: 'contact' as const,
      isAdmin: true,
      groupId: null,
    },
    {
      id: 77,
      label: 'PANTAU BW R1NET',
      phoneNumber: '120363406283540214@g.us',
      targetType: 'group' as const,
      isAdmin: false,
      groupId: null,
    },
  ];

  for (const r of defaultRecipients) {
    const existing = await prisma.prtgRecipient.findFirst({
      where: { phoneNumber: r.phoneNumber, groupId: r.groupId },
    });
    if (!existing) {
      const existingById = await prisma.prtgRecipient.findUnique({
        where: { id: r.id },
      });
      const data = {
        label: r.label,
        phoneNumber: r.phoneNumber,
        targetType: r.targetType,
        enabled: true,
        isAdmin: r.isAdmin,
        groupId: r.groupId,
      };
      if (existingById) {
        await prisma.prtgRecipient.create({ data });
      } else {
        await prisma.prtgRecipient.create({
          data: { ...data, id: r.id },
        });
      }
    }
  }
  console.log(`✓ ${defaultRecipients.length} recipients ensured`);

  await prisma.pingMonitor.upsert({
    where: { host: 'http://prtg.r1net.id' },
    create: {
      name: 'Web PRTG R1NET',
      host: 'http://prtg.r1net.id',
      enabled: true,
      intervalSeconds: 2,
      pingTimeoutSeconds: 5,
      rtoThresholdCount: 10,
      notificationCooldownSeconds: 3600,
      maintenance: false,
      notifyRecovery: true,
      alertTemplate: '*ALERT WEB PRTG*\nWeb PRTG R1NET ({host}) tidak bisa diakses dalam {outageSeconds} detik yang lalu.\nWaktu: {time}',
      recoveryTemplate: '*PULIH*\nWeb PRTG R1NET ({host}) kembali bisa diakses.\nResponse: {latencyMs} ms\nWaktu: {time}',
    },
    update: {
      name: 'Web PRTG R1NET',
      pingTimeoutSeconds: 5,
      alertTemplate: '*ALERT WEB PRTG*\nWeb PRTG R1NET ({host}) tidak bisa diakses dalam {outageSeconds} detik yang lalu.\nWaktu: {time}',
      recoveryTemplate: '*PULIH*\nWeb PRTG R1NET ({host}) kembali bisa diakses.\nResponse: {latencyMs} ms\nWaktu: {time}',
    },
  });
  console.log('✓ Default web monitor http://prtg.r1net.id ensured');

  // ─── Default schedule ─────────────────────────────────────────────────────
  await prisma.pingMonitor.updateMany({
    where: { host: '223.130.21.34' },
    data: {
      enabled: false,
      maintenance: true,
      maintenanceLabel: 'Diganti ke Web PRTG',
    },
  });

  const existingSchedule = await prisma.prtgSchedule.findFirst({ where: { id: 1 } });
  if (!existingSchedule) {
    await prisma.prtgSchedule.create({
      data: {
        id: 1,
        name: 'Tiap jam dari jam 6 sampai 23',
        groupId: null,
        cron: '59 6-23 * * *',
        enabled: true,
        targetMode: 'group_only',
      },
    });
    console.log('✓ Default schedule created');
  } else {
    console.log('  Schedule already exists, skipping');
  }

  // ─── Reset sequences ──────────────────────────────────────────────────────
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"PrtgGroup"', 'id'), GREATEST((SELECT MAX(id) FROM "PrtgGroup"), 10), true)`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"PrtgConfig"', 'id'), GREATEST((SELECT MAX(id) FROM "PrtgConfig"), 88), true)`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"PrtgRecipient"', 'id'), GREATEST((SELECT MAX(id) FROM "PrtgRecipient"), 77), true)`,
  );
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"PrtgSchedule"', 'id'), GREATEST((SELECT MAX(id) FROM "PrtgSchedule"), 1), true)`,
  );

  console.log('\n✓ Deploy seed completed successfully');
}

main()
  .catch((error) => {
    console.error('Deploy seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
