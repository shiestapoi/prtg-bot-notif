import type { PoolConfig } from 'pg';

export function createPostgresPoolConfig(
  connectionString?: string,
): PoolConfig {
  const isLocal =
    !connectionString ||
    connectionString.includes('localhost') ||
    connectionString.includes('127.0.0.1');

  return {
    connectionString,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  };
}
