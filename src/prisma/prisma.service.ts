import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { createPostgresPoolConfig } from './postgres-options';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const pool = new Pool(createPostgresPoolConfig(process.env.DATABASE_URL));
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    await this.autoMigrate();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /**
   * Auto-add missing columns to the database without requiring a manual migration.
   * This ensures new fields (like 'maintenance') are available even if prisma migrate hasn't been run.
   * Safe for Heroku: uses IF NOT EXISTS pattern, non-destructive, won't lose existing data.
   */
  private async autoMigrate() {
    const migrations: Array<{ column: string; table: string; sql: string }> = [
      {
        table: 'PrtgConfig',
        column: 'maintenance',
        sql: `ALTER TABLE "PrtgConfig" ADD COLUMN IF NOT EXISTS "maintenance" BOOLEAN NOT NULL DEFAULT false`,
      },
    ];

    for (const migration of migrations) {
      try {
        const result: Array<{ column_name: string }> = await this.$queryRaw`
          SELECT column_name FROM information_schema.columns
          WHERE table_name = ${migration.table} AND column_name = ${migration.column}
        `;

        if (result.length === 0) {
          // Use $executeRawUnsafe because tagged template doesn't work well with DDL statements
          await this.$executeRawUnsafe(migration.sql);
          this.logger.log(`Auto-migrated: Added "${migration.column}" column to ${migration.table}`);
        }
      } catch (error) {
        // Non-fatal: column might already exist (race condition with multiple dynos)
        // or the ADD COLUMN IF NOT EXISTS handled it silently
        this.logger.warn(
          `Auto-migration for ${migration.table}.${migration.column} warning: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }
}
