/**
 * Update message templates only — does NOT touch any other data.
 * Run with: npx tsx prisma/update-templates.ts
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import 'dotenv/config';
import { createPostgresPoolConfig } from '../src/prisma/postgres-options';

const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // WhatsApp formatting:
  // *bold* — untuk judul/highlight
  // _italic_ — untuk info tambahan
  // ```monospace``` — untuk data/angka
  // ━ — garis pemisah

  const messageTemplate = '*{title}*\n🏢 _{groupname}_\n⏰ {time}\n📊 Traffic: ```{bitrate}```';

  const alertMessageTemplate = [
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
  ].join('\n');

  const recoveryMessageTemplate = [
    '━━━━━━━━━━━━━━━━',
    '✅ *PULIH: {title}*',
    '━━━━━━━━━━━━━━━━',
    '🏢 _{groupName}_',
    '⏰ {time}',
    '📊 Total: ```{bitrate}```',
    '📥 In: ```{trafficIn}```',
    '📤 Out: ```{trafficOut}```',
    '━━━━━━━━━━━━━━━━',
  ].join('\n');

  await prisma.prtgSetting.update({
    where: { id: 1 },
    data: {
      messageTemplate,
      alertMessageTemplate,
      recoveryMessageTemplate,
    },
  });

  console.log('✓ Templates updated successfully!\n');
  console.log('── Report Schedule Template ──');
  console.log(messageTemplate);
  console.log('\n── Alert Template ──');
  console.log(alertMessageTemplate);
  console.log('\n── Recovery Template ──');
  console.log(recoveryMessageTemplate);
}

main()
  .catch((error) => {
    console.error('Failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
