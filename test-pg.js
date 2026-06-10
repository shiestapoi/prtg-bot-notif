const { Client } = require('pg');

async function main() {
  const client = new Client({
    connectionString: 'postgresql://noc:123qweasdzxc@202.155.95.25:5432/prtgr1net?schema=public'
  });
  await client.connect();
  
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const res = await client.query(`
    SELECT "configId", SUM(CASE WHEN "status" IN ('DOWN', 'NO_TRAFFIC') AND "prev_status" NOT IN ('DOWN', 'NO_TRAFFIC') THEN 1 ELSE 0 END) as "downCountMonth" 
    FROM (
      SELECT "configId", "status", "timestamp", LAG("status", 1, 'NORMAL') OVER (PARTITION BY "configId" ORDER BY "timestamp" ASC) as "prev_status" 
      FROM "MonitoringHistory" 
      WHERE "timestamp" >= $1
    ) sub 
    GROUP BY "configId"
  `, [monthStart]);
  
  console.log(res.rows);
  await client.end();
}

main().catch(console.error);
