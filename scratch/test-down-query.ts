import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  // Pick a config ID to test, e.g. 52 for LL INDOSAT
  const config = await prisma.prtgConfig.findFirst({
    where: { title: { contains: 'LL INDOSAT' } },
  });

  if (!config) {
    console.log('No config found');
    return;
  }

  const configIds = [config.id];

  const downCounts: any[] = await prisma.$queryRaw`
    SELECT 
      "configId", 
      SUM(CASE WHEN ("timestamp" >= ${todayStart}) AND ("prev_ts_month" IS NULL OR extract(epoch from ("timestamp" - "prev_ts_month")) > 3600) THEN 1 ELSE 0 END) as "downCountToday",
      SUM(CASE WHEN "prev_ts_month" IS NULL OR extract(epoch from ("timestamp" - "prev_ts_month")) > 3600 THEN 1 ELSE 0 END) as "downCountMonth"
    FROM (
      SELECT 
        "configId", 
        "timestamp",
        LAG("timestamp") OVER (PARTITION BY "configId" ORDER BY "timestamp" ASC) as "prev_ts_month"
      FROM "MonitoringHistory"
      WHERE "configId" IN (${config.id})
        AND "timestamp" >= ${monthStart}
        AND "status" IN ('DOWN'::"NocStatus", 'NO_TRAFFIC'::"NocStatus")
    ) sub
    GROUP BY "configId"
  `;

  console.log(downCounts);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
