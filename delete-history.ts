import { Client } from 'pg';

async function main() {
  const client = new Client({
    connectionString: "postgres://ua0tngh3amsnie:pc9c46177f7bb82eb7acf25cf7bfce91823eef67d2a554be0437917a51f4b8837@c4fqkld51su0p3.cluster-czrs8kj4isg7.us-east-1.rds.amazonaws.com:5432/d5ef3uk957jd7s?sslmode=require",
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();

  const res = await client.query(`
    DELETE FROM "MonitoringHistory"
    WHERE "configId" IN (
      SELECT id FROM "PrtgConfig" WHERE title IN ('IPTX TELKOM', 'CDN H3I')
    )
  `);

  console.log(`Deleted ${res.rowCount} rows`);
  await client.end();
}

main().catch(console.error);
