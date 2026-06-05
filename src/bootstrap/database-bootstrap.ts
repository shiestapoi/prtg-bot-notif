import { execFileSync } from 'child_process';
import { createPostgresPoolConfig } from '../prisma/postgres-options';

function run(command: string, args: string[]) {
  const executable = process.platform === 'win32' ? `${command}.cmd` : command;
  execFileSync(executable, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
  });
}

export function ensureDatabaseReady() {
  if (process.env.SKIP_DB_BOOTSTRAP === 'true') {
    console.log('[db-bootstrap] Skipped because SKIP_DB_BOOTSTRAP=true');
    return;
  }

  if (!process.env.DATABASE_URL) {
    console.warn('[db-bootstrap] DATABASE_URL is not configured; skipping database bootstrap.');
    return;
  }

  console.log('[db-bootstrap] Ensuring database schema and seed data are ready...');
  run('npx', ['prisma', 'migrate', 'deploy']);

  ensureNonDestructiveSchema();

  run('npx', ['tsx', 'prisma/seed-deploy.ts']);
  console.log('[db-bootstrap] Database is ready.');
}

export function ensureNonDestructiveSchema() {
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
  ];

  for (const statement of statements) {
    execFileSync(
      'node',
      [
        '-e',
        `
        const { Pool } = require('pg');
        const pool = new Pool(${JSON.stringify(createPostgresPoolConfig(process.env.DATABASE_URL))});
        pool.query(${JSON.stringify(statement)})
          .then(() => pool.end())
          .catch(async (error) => { await pool.end(); console.error(error); process.exit(1); });
        `,
      ],
      { stdio: 'inherit' },
    );
  }
}
