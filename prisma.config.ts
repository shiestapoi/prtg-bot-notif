import { defineConfig } from 'prisma/config';
import 'dotenv/config';

export default defineConfig({
  schema: './prisma/schema.prisma',
  datasource: {
    url: process.env.DATABASE_URL || 'postgresql://dummy:dummy@localhost:5432/dummy',
  },
  migrations: {
    path: './prisma/migrations',
    seed: 'npx tsx prisma/seed.ts',
  },
});
