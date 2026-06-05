import { execFileSync } from 'child_process';

function run(command: string, args: string[]) {
  execFileSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
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

  // Safe by default: without --accept-data-loss, Prisma refuses destructive changes.
  run('npx', ['prisma', 'db', 'push']);

  run('npx', ['tsx', 'prisma/seed-deploy.ts']);
  console.log('[db-bootstrap] Database is ready.');
}
