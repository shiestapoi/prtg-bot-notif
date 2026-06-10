const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const config = await prisma.prtgConfig.findFirst({where:{title:'CDN DMNET'}});
  if (!config) { console.log("Not found"); return; }
  const history = await prisma.monitoringHistory.findMany({where:{configId: config.id}, orderBy:{timestamp:'desc'}, take: 10});
  console.log(history.map(h => ({time: h.timestamp, status: h.status})));
}

main().finally(() => prisma.$disconnect());
