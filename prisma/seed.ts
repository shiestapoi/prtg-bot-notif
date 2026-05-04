import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import bcrypt from 'bcryptjs';
import 'dotenv/config';
import { Pool } from 'pg';
import { createPostgresPoolConfig } from '../src/prisma/postgres-options';

const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const groups = [
  {
    id: 1,
    name: 'PEKANBARU',
    enabled: true,
    createdAt: '2026-05-03T09:04:50.537Z',
    updatedAt: '2026-05-03T09:04:50.537Z',
  },
  {
    id: 2,
    name: 'RAWANGKAO',
    enabled: true,
    createdAt: '2026-05-03T09:10:59.761Z',
    updatedAt: '2026-05-03T09:10:59.761Z',
  },
  {
    id: 3,
    name: 'DUMAI',
    enabled: true,
    createdAt: '2026-05-03T09:11:02.957Z',
    updatedAt: '2026-05-03T09:11:02.957Z',
  },
  {
    id: 4,
    name: 'SEI PAKNING',
    enabled: true,
    createdAt: '2026-05-03T09:11:07.698Z',
    updatedAt: '2026-05-03T09:11:07.698Z',
  },
  {
    id: 5,
    name: 'BUNGARAYA',
    enabled: true,
    createdAt: '2026-05-03T09:11:16.798Z',
    updatedAt: '2026-05-03T09:11:16.798Z',
  },
  {
    id: 6,
    name: 'PERAWANG',
    enabled: true,
    createdAt: '2026-05-03T09:11:24.408Z',
    updatedAt: '2026-05-03T09:11:24.408Z',
  },
  {
    id: 7,
    name: 'SIAK KOTA',
    enabled: true,
    createdAt: '2026-05-03T09:11:28.851Z',
    updatedAt: '2026-05-03T09:11:28.851Z',
  },
  {
    id: 8,
    name: 'KAYU MANIS',
    enabled: true,
    createdAt: '2026-05-03T19:50:08.358Z',
    updatedAt: '2026-05-03T19:50:08.358Z',
  },
];

const configs = [
  [
    1,
    'LL Solnet',
    'http://prtg.r1net.id/graphzoom.htm?id=2669&graphid=1&clgid=&dynamicgraph=1',
    7,
    true,
    null,
    '2026-05-03T09:15:38.388Z',
    '2026-05-03T09:50:36.188Z',
  ],
  [
    2,
    'LL Indosat',
    'http://prtg.r1net.id/graphzoom.htm?id=2624&graphid=1&clgid=&dynamicgraph=1',
    7,
    true,
    null,
    '2026-05-03T18:55:18.548Z',
    '2026-05-03T18:55:18.548Z',
  ],
  [
    3,
    'LL Telkom',
    'http://prtg.r1net.id/graphzoom.htm?id=2659&graphid=1&clgid=&dynamicgraph=1',
    4,
    true,
    null,
    '2026-05-03T19:01:12.944Z',
    '2026-05-03T19:01:12.944Z',
  ],
  [
    4,
    'LL Indosat',
    'http://prtg.r1net.id/graphzoom.htm?id=2658&graphid=1&clgid=&dynamicgraph=1',
    4,
    true,
    null,
    '2026-05-03T19:02:06.469Z',
    '2026-05-03T19:02:06.469Z',
  ],
  [
    5,
    'LL Solnet',
    'http://prtg.r1net.id/graphzoom.htm?id=2719&graphid=1&clgid=&dynamicgraph=1',
    6,
    true,
    null,
    '2026-05-03T19:02:41.775Z',
    '2026-05-03T21:15:38.855Z',
  ],
  [
    6,
    'LL Indosat',
    'http://prtg.r1net.id/graphzoom.htm?id=2717&graphid=1&clgid=&dynamicgraph=1',
    2,
    true,
    null,
    '2026-05-03T19:04:33.714Z',
    '2026-05-03T19:04:33.714Z',
  ],
  [
    7,
    'LL XL',
    'http://prtg.r1net.id/graphzoom.htm?id=2588&graphid=1&clgid=&dynamicgraph=1',
    5,
    true,
    null,
    '2026-05-03T19:05:37.003Z',
    '2026-05-03T19:05:37.003Z',
  ],
  [
    8,
    'LL MORA',
    'http://prtg.r1net.id/graphzoom.htm?id=2511&graphid=1&clgid=&dynamicgraph=1',
    3,
    true,
    null,
    '2026-05-03T19:07:10.281Z',
    '2026-05-03T19:07:10.281Z',
  ],
  [
    39,
    'LL INDOSAT',
    'http://prtg.r1net.id/graphzoom.htm?id=2484&graphid=1&clgid=&dynamicgraph=1',
    3,
    true,
    null,
    '2026-05-03T19:43:50.229Z',
    '2026-05-03T19:43:50.229Z',
  ],
  [
    40,
    'LL INDOSAT',
    'http://prtg.r1net.id/graphzoom.htm?id=2657&graphid=1&clgid=&dynamicgraph=1',
    6,
    true,
    null,
    '2026-05-03T19:48:00.983Z',
    '2026-05-03T19:48:00.983Z',
  ],
  [
    41,
    'LL TELKOM',
    'http://prtg.r1net.id/graphzoom.htm?id=2591&graphid=1&clgid=&dynamicgraph=1',
    5,
    true,
    null,
    '2026-05-03T19:48:45.767Z',
    '2026-05-03T19:48:45.767Z',
  ],
  [
    42,
    'LACP to NE40E',
    'http://prtg.r1net.id/graphzoom.htm?id=2419&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:50:43.037Z',
    '2026-05-03T19:50:43.037Z',
  ],
  [
    43,
    'TO R-MPLS-PKU-01 (Gi0/2/1)',
    'http://prtg.r1net.id/graphzoom.htm?id=2413&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:51:08.864Z',
    '2026-05-03T19:54:30.583Z',
  ],
  [
    44,
    'TO R-MPLS-PKU-01 (Gi0/2/0)',
    'http://prtg.r1net.id/graphzoom.htm?id=2412&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:51:45.211Z',
    '2026-05-03T19:52:53.629Z',
  ],
  [
    45,
    'BRAS-DUMAI',
    'http://prtg.r1net.id/graphzoom.htm?id=2414&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:55:03.987Z',
    '2026-05-03T19:55:03.987Z',
  ],
  [
    46,
    'PTP NEUCENTRIX',
    'http://prtg.r1net.id/graphzoom.htm?id=2418&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:55:24.017Z',
    '2026-05-03T19:55:24.017Z',
  ],
  [
    47,
    'BRAS Perawang',
    'http://prtg.r1net.id/graphzoom.htm?id=2479&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:55:43.161Z',
    '2026-05-03T19:55:43.161Z',
  ],
  [
    48,
    'BRAS 1 KAYU MANIS',
    'http://prtg.r1net.id/graphzoom.htm?id=2485&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:56:35.564Z',
    '2026-05-03T19:56:35.564Z',
  ],
  [
    49,
    'Indosat Jondul Traffic',
    'http://prtg.r1net.id/graphzoom.htm?id=2410&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:57:09.778Z',
    '2026-05-03T19:57:09.778Z',
  ],
  [
    50,
    'SOLNET IPT',
    'http://prtg.r1net.id/graphzoom.htm?id=2415&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:57:29.508Z',
    '2026-05-03T19:57:29.508Z',
  ],
  [
    51,
    'BRAS Pakning',
    'http://prtg.r1net.id/graphzoom.htm?id=2477&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:57:50.365Z',
    '2026-05-03T19:57:50.365Z',
  ],
  [
    52,
    'to XL Traffic',
    'http://prtg.r1net.id/graphzoom.htm?id=2589&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:58:17.437Z',
    '2026-05-03T19:58:17.437Z',
  ],
  [
    53,
    'TO DASHNET Traffic',
    'http://prtg.r1net.id/graphzoom.htm?id=2406&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:58:39.040Z',
    '2026-05-03T19:58:39.040Z',
  ],
  [
    54,
    'XCON H3I CDN 2 Traffic',
    'http://prtg.r1net.id/graphzoom.htm?id=2408&graphid=1&clgid=&dynamicgraph=1',
    8,
    true,
    null,
    '2026-05-03T19:58:58.782Z',
    '2026-05-03T19:58:58.782Z',
  ],
] as const;

const recipients = [
  [
    34,
    'Notif Siak Kota',
    '120363429085861592@g.us',
    'group',
    true,
    '2026-05-03T09:48:49.106Z',
    '2026-05-03T09:48:59.059Z',
    7,
    false,
  ],
  [
    35,
    'Notif Bungaraya',
    '120363428114701570@g.us',
    'group',
    true,
    '2026-05-03T20:00:07.148Z',
    '2026-05-03T20:00:07.148Z',
    5,
    false,
  ],
  [
    36,
    'Notif Dumai',
    '120363428638100912@g.us',
    'group',
    true,
    '2026-05-03T20:00:19.851Z',
    '2026-05-03T20:00:19.851Z',
    3,
    false,
  ],
  [
    37,
    'Notif Pekanbaru',
    '120363408591413761@g.us',
    'group',
    true,
    '2026-05-03T20:00:42.658Z',
    '2026-05-03T20:00:42.658Z',
    1,
    false,
  ],
  [
    38,
    'Notif Perawang',
    '120363408933202066@g.us',
    'group',
    true,
    '2026-05-03T20:00:59.648Z',
    '2026-05-03T20:00:59.648Z',
    6,
    false,
  ],
  [
    39,
    'Notif Rawangkao',
    '120363407582095190@g.us',
    'group',
    true,
    '2026-05-03T20:01:09.121Z',
    '2026-05-03T20:01:09.121Z',
    2,
    false,
  ],
  [
    40,
    'Notif Sei Pakning',
    '120363409708255230@g.us',
    'group',
    true,
    '2026-05-03T20:01:18.032Z',
    '2026-05-03T20:01:18.032Z',
    4,
    false,
  ],
  [
    42,
    'Notif Kayu Manis',
    '120363425965875481@g.us',
    'group',
    true,
    '2026-05-03T20:04:14.832Z',
    '2026-05-03T20:04:14.832Z',
    8,
    false,
  ],
  [
    43,
    'Swenson Simanjuntak',
    '6282179438863@s.whatsapp.net',
    'contact',
    true,
    '2026-05-03T20:06:21.104Z',
    '2026-05-03T20:06:21.104Z',
    null,
    true,
  ],
] as const;

const users = [
  {
    id: 'cmoprkgmf00008fs53zpihed2',
    username: 'haruyaki',
    passwordHash:
      '$2a$12$3NVXL.822Y3LCNXpZRSd8etO5VhS7/ian0q3BEz4K9qci6oHZEiVe',
    createdAt: '2026-05-03T05:45:44.871Z',
    updatedAt: '2026-05-03T05:45:44.871Z',
  },
  {
    id: 'cmoprlid60000qbe2abfoudpn',
    username: 'admin',
    passwordHash:
      '$2a$12$QSpIvOJChuwYpL4x0QQ8DeuI5KiaJM0uoEEVQjzO4zZcbEJVQxV5G',
    createdAt: '2026-05-03T05:46:33.786Z',
    updatedAt: '2026-05-03T21:58:51.543Z',
  },
];

function date(value: string) {
  return new Date(value);
}

async function resetSequence(table: string, maxId: number) {
  await prisma.$executeRawUnsafe(
    `SELECT setval(pg_get_serial_sequence('"${table}"', 'id'), ${maxId}, true)`,
  );
}

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
  await seedUsers();

  await prisma.prtgSetting.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      loginUrl: 'http://prtg.r1net.id/index.htm',
      loginUsername: 'noc',
      loginPassword: '1Qaz2wsx',
      messageTemplate: '{title}\nGroup: {groupname}',
      privateMessageTemplate: '{title}\nGroup :  {groupname}',
      groupMessageTemplate: '{title}',
      createdAt: date('2026-05-04T01:23:03.166Z'),
      updatedAt: date('2026-05-03T21:18:24.941Z'),
    },
    update: {
      loginUrl: 'http://prtg.r1net.id/index.htm',
      loginUsername: 'noc',
      loginPassword: '1Qaz2wsx',
      messageTemplate: '{title}\nGroup: {groupname}',
      privateMessageTemplate: '{title}\nGroup :  {groupname}',
      groupMessageTemplate: '{title}',
      updatedAt: date('2026-05-03T21:18:24.941Z'),
    },
  });

  await prisma.prtgCookie.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      label: 'Auto login 2026-05-04T03:00:06.680Z',
      value:
        'OCTOPUS173332753=e0I2OUU2N0ZCLUQ0RjgtNDAwRi04NzdDLTAyQzc5ODlFRjdFMX0%3D',
      isActive: true,
      createdAt: date('2026-05-03T09:27:44.978Z'),
      updatedAt: date('2026-05-03T20:00:06.683Z'),
    },
    update: {
      label: 'Auto login 2026-05-04T03:00:06.680Z',
      value:
        'OCTOPUS173332753=e0I2OUU2N0ZCLUQ0RjgtNDAwRi04NzdDLTAyQzc5ODlFRjdFMX0%3D',
      isActive: true,
      updatedAt: date('2026-05-03T20:00:06.683Z'),
    },
  });

  for (const group of groups) {
    await prisma.prtgGroup.upsert({
      where: { id: group.id },
      create: {
        ...group,
        createdAt: date(group.createdAt),
        updatedAt: date(group.updatedAt),
      },
      update: {
        name: group.name,
        enabled: group.enabled,
        updatedAt: date(group.updatedAt),
      },
    });
  }

  for (const item of configs) {
    const [
      id,
      title,
      requestUrl,
      groupId,
      enabled,
      cookieId,
      createdAt,
      updatedAt,
    ] = item;
    await prisma.prtgConfig.upsert({
      where: { id },
      create: {
        id,
        title,
        requestUrl,
        groupId,
        enabled,
        cookieId,
        createdAt: date(createdAt),
        updatedAt: date(updatedAt),
      },
      update: {
        title,
        requestUrl,
        groupId,
        enabled,
        cookieId,
        updatedAt: date(updatedAt),
      },
    });
  }

  for (const item of recipients) {
    const [
      id,
      label,
      phoneNumber,
      targetType,
      enabled,
      createdAt,
      updatedAt,
      groupId,
      isAdmin,
    ] = item;
    await prisma.prtgRecipient.upsert({
      where: { id },
      create: {
        id,
        label,
        phoneNumber,
        targetType,
        enabled,
        groupId,
        isAdmin,
        createdAt: date(createdAt),
        updatedAt: date(updatedAt),
      },
      update: {
        label,
        phoneNumber,
        targetType,
        enabled,
        groupId,
        isAdmin,
        updatedAt: date(updatedAt),
      },
    });
  }

  await prisma.prtgSchedule.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      name: 'Every 30 Minutes',
      groupId: null,
      cron: '*/30 * * * *',
      enabled: true,
      targetMode: 'group_only',
      createdAt: date('2026-05-03T19:43:00.421Z'),
      updatedAt: date('2026-05-03T23:04:07.319Z'),
    },
    update: {
      name: 'Every 30 Minutes',
      groupId: null,
      cron: '*/30 * * * *',
      enabled: true,
      targetMode: 'group_only',
      updatedAt: date('2026-05-03T23:04:07.319Z'),
    },
  });

  await resetSequence('PrtgCookie', 1);
  await resetSequence('PrtgGroup', 8);
  await resetSequence('PrtgConfig', 54);
  await resetSequence('PrtgRecipient', 43);
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
