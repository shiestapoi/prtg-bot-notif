import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const res = await prisma.$queryRaw`SELECT "configId", SUM(CASE WHEN "status" IN ('DOWN'::"NocStatus", 'NO_TRAFFIC'::"NocStatus") AND "prev_status" NOT IN ('DOWN'::"NocStatus", 'NO_TRAFFIC'::"NocStatus") THEN 1 ELSE 0 END) as "downCountMonth" FROM (SELECT "configId", "status", "timestamp", LAG("status", 1, 'NORMAL'::"NocStatus") OVER (PARTITION BY "configId" ORDER BY "timestamp" ASC) as "prev_status" FROM "MonitoringHistory" WHERE "timestamp" >= ${monthStart}) sub GROUP BY "configId"`;
  console.log(res);
}
main().finally(() => prisma.$disconnect());
