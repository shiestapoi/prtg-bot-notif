import { execFileSync } from 'child_process';
import { Pool } from 'pg';
import { createPostgresPoolConfig } from '../prisma/postgres-options';

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
}

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function runWithRetry(label: string, command: string, args: string[]) {
  const maxAttempts = Number(process.env.DB_BOOTSTRAP_RETRIES ?? 6);
  const baseDelayMs = Number(process.env.DB_BOOTSTRAP_RETRY_DELAY_MS ?? 5000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      run(command, args);
      return true;
    } catch (error) {
      const isLast = attempt === maxAttempts;
      console.warn(
        `[db-bootstrap] ${label} failed (${attempt}/${maxAttempts}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (isLast) return false;
      sleep(baseDelayMs * attempt);
    }
  }

  return false;
}

export async function ensureDatabaseReady() {
  if (process.env.SKIP_DB_BOOTSTRAP === 'true') {
    console.log('[db-bootstrap] Skipped because SKIP_DB_BOOTSTRAP=true');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn(
      '[db-bootstrap] DATABASE_URL is not configured; skipping database bootstrap.',
    );
    return;
  }

  console.log(
    '[db-bootstrap] Ensuring database schema and seed data are ready...',
  );
  if (
    !runWithRetry('prisma db push', 'npx', [
      'prisma',
      'db',
      'push',
      '--accept-data-loss',
    ])
  ) {
    console.warn(
      '[db-bootstrap] Database is not reachable after retries. Starting app in degraded mode; it will recover when the database is reachable.',
    );
    return;
  }

  // Check if tables actually exist (in case migrate deploy did nothing because there are no migrations)
  let tablesMissing = false;
  const poolCheck = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
  try {
    await poolCheck.query('SELECT 1 FROM "PrtgSetting" LIMIT 1');
  } catch (err) {
    tablesMissing = true;
  } finally {
    await poolCheck.end();
  }

  if (tablesMissing) {
    console.log('[db-bootstrap] Tables are missing (no migrations found). Running prisma db push...');
    if (
      !runWithRetry('prisma db push', 'npx', [
        'prisma',
        'db',
        'push',
        '--accept-data-loss',
        '--skip-generate'
      ])
    ) {
      console.warn('[db-bootstrap] Prisma DB Push failed.');
      return;
    }
  }

  if (!(await ensureNonDestructiveSchema())) {
    console.warn(
      '[db-bootstrap] Non-destructive schema bootstrap failed after retries. Starting app in degraded mode.',
    );
    return;
  }

  let needsSeed = false;
  const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
  try {
    // Check if PrtgSetting exists to determine if database was already seeded.
    // This is safer than checking 'User' because users might be manually deleted.
    const res = await pool.query('SELECT COUNT(*) FROM "PrtgSetting"');
    const count = parseInt(res.rows[0].count, 10);
    needsSeed = count === 0;
  } catch (error) {
    console.warn(
      '[db-bootstrap] Error checking "PrtgSetting" table count. Assuming seed is needed.',
      error,
    );
    needsSeed = true;
  } finally {
    await pool.end();
  }

  if (needsSeed) {
    console.log(
      '[db-bootstrap] Database table is empty. Running seed deploy...',
    );
    if (!runWithRetry('seed deploy', 'npx', ['tsx', 'prisma/seed-deploy.ts'])) {
      console.warn(
        '[db-bootstrap] Seed deploy failed after retries. Starting app; seed will be retried on next boot/release.',
      );
      return;
    }
  } else {
    console.log(
      '[db-bootstrap] Database already has data. Skipping seed deploy.',
    );
  }
  console.log('[db-bootstrap] Database is ready.');
}

async function queryWithRetry(pool: Pool, label: string, statement: string) {
  const maxAttempts = Number(process.env.DB_BOOTSTRAP_RETRIES ?? 6);
  const baseDelayMs = Number(process.env.DB_BOOTSTRAP_RETRY_DELAY_MS ?? 5000);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.query(statement);
      return true;
    } catch (error) {
      const isLast = attempt === maxAttempts;
      console.warn(
        `[db-bootstrap] ${label} failed (${attempt}/${maxAttempts}): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      if (isLast) return false;
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * attempt),
      );
    }
  }

  return false;
}

export async function ensureNonDestructiveSchema() {
  const statements = [
    `
    DO $$
    BEGIN
      CREATE TYPE "PingMonitorStatus" AS ENUM ('UNKNOWN', 'UP', 'RTO');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    DO $$
    BEGIN
      CREATE TYPE "RecipientTargetType" AS ENUM ('contact', 'group', 'channel', 'manual');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    CREATE TABLE IF NOT EXISTS "PingMonitor" (
      "id" SERIAL PRIMARY KEY,
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
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `CREATE UNIQUE INDEX IF NOT EXISTS "PingMonitor_host_key" ON "PingMonitor"("host");`,
    `
    CREATE TABLE IF NOT EXISTS "PingRecipient" (
      "id" SERIAL PRIMARY KEY,
      "label" TEXT,
      "phoneNumber" TEXT NOT NULL,
      "targetType" "RecipientTargetType" NOT NULL DEFAULT 'manual',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    CREATE TABLE IF NOT EXISTS "PingMonitorRecipient" (
      "pingMonitorId" INTEGER NOT NULL,
      "pingRecipientId" INTEGER NOT NULL,
      CONSTRAINT "PingMonitorRecipient_pkey" PRIMARY KEY ("pingMonitorId","pingRecipientId")
    );
    `,
    `ALTER TABLE "PingMonitor" ADD COLUMN IF NOT EXISTS "notificationCooldownSeconds" INTEGER NOT NULL DEFAULT 3600;`,
    `ALTER TABLE "PingMonitor" ADD COLUMN IF NOT EXISTS "maintenance" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "PingMonitor" ADD COLUMN IF NOT EXISTS "maintenanceLabel" TEXT;`,
    `ALTER TABLE "PrtgConfig" ADD COLUMN IF NOT EXISTS "maintenance" BOOLEAN NOT NULL DEFAULT false;`,
    `ALTER TABLE "PrtgConfig" ADD COLUMN IF NOT EXISTS "maintenanceLabel" TEXT;`,
    `ALTER TABLE "PrtgConfig" ADD COLUMN IF NOT EXISTS "minTrafficThreshold" DOUBLE PRECISION NOT NULL DEFAULT 10.0;`,
    `
    DO $$
    BEGIN
      ALTER TABLE "PingMonitorRecipient"
      ADD CONSTRAINT "PingMonitorRecipient_pingMonitorId_fkey"
      FOREIGN KEY ("pingMonitorId") REFERENCES "PingMonitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    DO $$
    BEGIN
      ALTER TABLE "PingMonitorRecipient"
      ADD CONSTRAINT "PingMonitorRecipient_pingRecipientId_fkey"
      FOREIGN KEY ("pingRecipientId") REFERENCES "PingRecipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    DO $$
    BEGIN
      CREATE TYPE "ReceiptPeriod" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    CREATE TABLE IF NOT EXISTS "ReceiptSchedule" (
      "id" SERIAL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "groupId" INTEGER,
      "cron" TEXT NOT NULL,
      "period" "ReceiptPeriod" NOT NULL DEFAULT 'DAILY',
      "includeDown" BOOLEAN NOT NULL DEFAULT true,
      "includeLowTraffic" BOOLEAN NOT NULL DEFAULT false,
      "targetMode" "ScheduleTargetMode" NOT NULL DEFAULT 'all',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    DO $$
    BEGIN
      ALTER TABLE "ReceiptSchedule"
      ADD CONSTRAINT "ReceiptSchedule_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    ALTER TABLE "PrtgSetting" ADD COLUMN IF NOT EXISTS "receiptMessageTemplate" TEXT NOT NULL DEFAULT '*{title}*
GROUP : {groupName}
{details}';
    `,
    `
    DO $$
    BEGIN
      ALTER TYPE "NocStatus" ADD VALUE IF NOT EXISTS 'MAINTENANCE';
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
    `
    CREATE TABLE IF NOT EXISTS "ReceiptRecipient" (
      "id" SERIAL PRIMARY KEY,
      "label" TEXT,
      "phoneNumber" TEXT NOT NULL,
      "targetType" "RecipientTargetType" NOT NULL DEFAULT 'manual',
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "groupId" INTEGER,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    `,
    `
    DO $$
    BEGIN
      ALTER TABLE "ReceiptRecipient"
      ADD CONSTRAINT "ReceiptRecipient_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "PrtgGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
    `,
  ];

  const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
  try {
    for (const statement of statements) {
      const ok = await queryWithRetry(
        pool,
        'non-destructive schema statement',
        statement,
      );
      if (!ok) return false;
    }
  } finally {
    await pool.end();
  }

  return true;
}
