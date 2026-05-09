import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { Pool } from 'pg';
import { createPostgresPoolConfig } from '../src/prisma/postgres-options';

const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// ─── Seed Data ──────────────────────────────────────────────────────────────

const groups = [
  { id: 2, name: 'RAWANGKAO', enabled: true, createdAt: '2026-05-03T09:10:59.761Z', updatedAt: '2026-05-03T09:10:59.761Z' },
  { id: 3, name: 'DUMAI', enabled: true, createdAt: '2026-05-03T09:11:02.957Z', updatedAt: '2026-05-03T09:11:02.957Z' },
  { id: 4, name: 'SEI PAKNING', enabled: true, createdAt: '2026-05-03T09:11:07.698Z', updatedAt: '2026-05-03T09:11:07.698Z' },
  { id: 5, name: 'BUNGARAYA', enabled: true, createdAt: '2026-05-03T09:11:16.798Z', updatedAt: '2026-05-03T09:11:16.798Z' },
  { id: 6, name: 'PERAWANG', enabled: true, createdAt: '2026-05-03T09:11:24.408Z', updatedAt: '2026-05-03T09:11:24.408Z' },
  { id: 7, name: 'SIAK KOTA', enabled: true, createdAt: '2026-05-03T09:11:28.851Z', updatedAt: '2026-05-03T09:11:28.851Z' },
  { id: 9, name: 'PEKANBARU', enabled: true, createdAt: '2026-05-04T12:55:50.511Z', updatedAt: '2026-05-04T12:55:50.511Z' },
  { id: 10, name: 'RUMBAI', enabled: true, createdAt: '2026-05-04T13:06:22.484Z', updatedAt: '2026-05-04T13:06:22.484Z' },
];

const configs = [
  { id: 1, title: 'LL SOLNET', sensorId: 2669, groupId: 7, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T09:15:38.388Z', updatedAt: '2026-05-04T09:47:23.684Z' },
  { id: 2, title: 'LL INDOSAT', sensorId: 2624, groupId: 7, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T18:55:18.548Z', updatedAt: '2026-05-04T09:47:33.424Z' },
  { id: 3, title: 'LL TELKOM', sensorId: 2659, groupId: 4, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:01:12.944Z', updatedAt: '2026-05-04T09:47:03.016Z' },
  { id: 4, title: 'LL INDOSAT', sensorId: 2658, groupId: 4, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:02:06.469Z', updatedAt: '2026-05-04T09:47:12.203Z' },
  { id: 5, title: 'LL SOLNET', sensorId: 2719, groupId: 6, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:02:41.775Z', updatedAt: '2026-05-04T09:46:35.351Z' },
  { id: 6, title: 'LL INDOSAT', sensorId: 2717, groupId: 2, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:04:33.714Z', updatedAt: '2026-05-04T09:46:48.354Z' },
  { id: 7, title: 'LL XL', sensorId: 2588, groupId: 5, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:05:37.003Z', updatedAt: '2026-05-03T19:05:37.003Z' },
  { id: 8, title: 'LL MORA', sensorId: 2511, groupId: 3, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:07:10.281Z', updatedAt: '2026-05-03T19:07:10.281Z' },
  { id: 39, title: 'LL INDOSAT', sensorId: 2484, groupId: 3, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:43:50.229Z', updatedAt: '2026-05-03T19:43:50.229Z' },
  { id: 40, title: 'LL INDOSAT', sensorId: 2657, groupId: 6, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-03T19:48:00.983Z', updatedAt: '2026-05-03T19:48:00.983Z' },
  { id: 55, title: 'IPTX SOLNET', sensorId: 2242, groupId: 9, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-04T12:57:16.800Z', updatedAt: '2026-05-04T12:59:55.117Z' },
  { id: 56, title: 'IPTX TELKOM', sensorId: 2249, groupId: 9, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-04T12:58:28.226Z', updatedAt: '2026-05-04T12:58:28.226Z' },
  { id: 57, title: 'CDN H3I', sensorId: 2506, groupId: 9, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-04T13:00:16.058Z', updatedAt: '2026-05-04T13:00:16.058Z' },
  { id: 58, title: 'RUMBAI TRAFFIC', sensorId: 2411, groupId: 10, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-04T13:07:56.106Z', updatedAt: '2026-05-04T13:07:56.106Z' },
  { id: 88, title: 'LL INDOSAT', sensorId: 2721, groupId: 5, enabled: true, cookieId: null, monitoringEnabled: true, notifyDown: true, notifyNoTraffic: false, notifyLowTraffic: true, notifyFlapping: false, notifyRecovery: false, createdAt: '2026-05-06T08:33:20.902Z', updatedAt: '2026-05-06T10:09:06.587Z' },
];

const recipients = [
  { id: 43, label: 'Swenson Simanjuntak', phoneNumber: '6282179438863@s.whatsapp.net', targetType: 'contact' as const, enabled: true, createdAt: '2026-05-03T20:06:21.104Z', updatedAt: '2026-05-04T14:47:56.184Z', groupId: null, isAdmin: true },
  { id: 77, label: 'PANTAU BW R1NET', phoneNumber: '120363406283540214@g.us', targetType: 'group' as const, enabled: true, createdAt: '2026-05-08T10:07:03.433Z', updatedAt: '2026-05-08T10:07:03.433Z', groupId: null, isAdmin: false },
];

const users = [
  {
    id: 'cmoprkgmf00008fs53zpihed2',
    username: 'haruyaki',
    passwordHash: '$2a$12$3NVXL.822Y3LCNXpZRSd8etO5VhS7/ian0q3BEz4K9qci6oHZEiVe',
    createdAt: '2026-05-03T05:45:44.871Z',
    updatedAt: '2026-05-03T05:45:44.871Z',
  },
  {
    id: 'cmoprlid60000qbe2abfoudpn',
    username: 'admin',
    passwordHash: '$2a$12$QSpIvOJChuwYpL4x0QQ8DeuI5KiaJM0uoEEVQjzO4zZcbEJVQxV5G',
    createdAt: '2026-05-03T05:46:33.786Z',
    updatedAt: '2026-05-03T21:58:51.543Z',
  },
];

// ─── Helpers ────────────────────────────────────────────────────────────────

function date(value: string) {
  return new Date(value);
}

async function resetSequence(table: string, maxId: number) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), ${maxId}, true)`,
  );
}

async function cleanTables() {
  // Delete in order respecting FK constraints
  await prisma.monitoringHistory.deleteMany();
  await prisma.prtgConfig.deleteMany();
  await prisma.prtgRecipient.deleteMany();
  await prisma.prtgSchedule.deleteMany();
  await prisma.prtgGroup.deleteMany();
  await prisma.prtgCookie.deleteMany();
  await prisma.prtgSetting.deleteMany();
}

// ─── Seed Functions ─────────────────────────────────────────────────────────

async function seedUsers() {
  for (const user of users) {
    await prisma.user.upsert({
      where: { username: user.username },
      create: {
        id: user.id,
        username: user.username,
        passwordHash: user.passwordHash,
        createdAt: date(user.createdAt),
        updatedAt: date(user.updatedAt),
      },
      update: {
        passwordHash: user.passwordHash,
        updatedAt: date(user.updatedAt),
      },
    });
  }

  const username = process.env.SEED_USERNAME?.trim();
  const password = process.env.SEED_PASSWORD?.trim();
  if (username && password) {
    await prisma.user.upsert({
      where: { username },
      create: {
        username,
        passwordHash: await bcrypt.hash(password, 12),
      },
      update: {
        passwordHash: await bcrypt.hash(password, 12),
      },
    });
  }
}

async function main() {
  await cleanTables();
  await seedUsers();

  // PrtgSetting
  await prisma.prtgSetting.create({
    data: {
      id: 1,
      loginUrl: 'http://prtg.r1net.id/index.htm',
      loginUsername: 'noc',
      loginPassword: '1Qaz2wsx',
      messageTemplate: '*{title}*\n🏢 _{groupname}_\n⏰ {time}\n📊 Traffic: ```{bitrate}```',
      alertMessageTemplate: '━━━━━━━━━━━━━━━━\n⚠️ *ALERT: {status}*\n━━━━━━━━━━━━━━━━\n📍 *{title}*\n🏢 _{groupName}_\n⏰ {time}\n📊 Total: ```{bitrate}```\n📥 In: ```{trafficIn}```\n📤 Out: ```{trafficOut}```\n💬 {reason}\n━━━━━━━━━━━━━━━━',
      recoveryMessageTemplate: '━━━━━━━━━━━━━━━━\n✅ *PULIH: {title}*\n━━━━━━━━━━━━━━━━\n🏢 _{groupName}_\n⏰ {time}\n📊 Total: ```{bitrate}```\n📥 In: ```{trafficIn}```\n📤 Out: ```{trafficOut}```\n━━━━━━━━━━━━━━━━',
      createdAt: date('2026-05-04T08:56:39.653Z'),
      updatedAt: date('2026-05-08T10:07:25.935Z'),
    },
  });

  // PrtgCookie (placeholder — real cookie rotates)
  await prisma.prtgCookie.create({
    data: {
      id: 1,
      label: 'Auto login',
      value: 'OCTOPUS173332753=placeholder',
      isActive: true,
      createdAt: date('2026-05-03T09:27:44.978Z'),
      updatedAt: date('2026-05-03T20:00:06.683Z'),
    },
  });

  // PrtgGroup
  for (const group of groups) {
    await prisma.prtgGroup.create({
      data: {
        id: group.id,
        name: group.name,
        enabled: group.enabled,
        createdAt: date(group.createdAt),
        updatedAt: date(group.updatedAt),
      },
    });
  }

  // PrtgConfig (with monitoring fields — all configs have sensorId and monitoringEnabled set)
  for (const config of configs) {
    await prisma.prtgConfig.create({
      data: {
        id: config.id,
        title: config.title,
        sensorId: config.sensorId,
        groupId: config.groupId,
        enabled: config.enabled,
        cookieId: config.cookieId,
        monitoringEnabled: config.monitoringEnabled,
        notifyDown: config.notifyDown,
        notifyNoTraffic: config.notifyNoTraffic,
        notifyLowTraffic: config.notifyLowTraffic,
        notifyFlapping: config.notifyFlapping,
        notifyRecovery: config.notifyRecovery,
        createdAt: date(config.createdAt),
        updatedAt: date(config.updatedAt),
      },
    });
  }

  // PrtgRecipient
  for (const r of recipients) {
    await prisma.prtgRecipient.create({
      data: {
        id: r.id,
        label: r.label,
        phoneNumber: r.phoneNumber,
        targetType: r.targetType,
        enabled: r.enabled,
        groupId: r.groupId,
        isAdmin: r.isAdmin,
        createdAt: date(r.createdAt),
        updatedAt: date(r.updatedAt),
      },
    });
  }

  // PrtgSchedule
  await prisma.prtgSchedule.create({
    data: {
      id: 1,
      name: 'Tiap jam dari jam 6 sampai 23',
      groupId: null,
      cron: '59 6-23 * * *',
      enabled: true,
      targetMode: 'group_only',
      createdAt: date('2026-05-03T19:43:00.421Z'),
      updatedAt: date('2026-05-06T00:05:01.385Z'),
    },
  });

  // Reset sequences to max IDs
  await resetSequence('PrtgCookie', 1);
  await resetSequence('PrtgGroup', 10);
  await resetSequence('PrtgConfig', 88);
  await resetSequence('PrtgRecipient', 77);
  await resetSequence('PrtgSchedule', 1);

  console.log(
    `Seeded ${users.length} users, ${groups.length} groups, ${configs.length} configs, ${recipients.length} recipients, 1 cookie, 1 setting, and 1 schedule.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
