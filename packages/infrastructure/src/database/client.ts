import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import type { AppEnv } from "../config/env";
import * as schema from "../../drizzle/schema";

export function createPgPool(env: AppEnv): Pool {
  return new Pool({
    connectionString: env.DATABASE_URL,
    max: env.DATABASE_POOL_MAX,
    idleTimeoutMillis: env.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DATABASE_CONNECTION_TIMEOUT_MS
  });
}

export function createDatabaseClient(pool: Pool) {
  return drizzle(pool, { schema });
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
