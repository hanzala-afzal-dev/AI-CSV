import { createClient } from "redis";
import type { AppEnv } from "../config/env";

export type RedisClient = ReturnType<typeof createClient>;

export function createRedisClient(env: Pick<AppEnv, "REDIS_URL">): RedisClient {
  return createClient({ url: env.REDIS_URL });
}

export interface RedisConnectionOptions {
  readonly host: string;
  readonly port: number;
  readonly username?: string;
  readonly password?: string;
  readonly db?: number;
  readonly maxRetriesPerRequest: null;
}

export function createBullMqConnectionOptions(redisUrl: string): RedisConnectionOptions {
  const parsed = new URL(redisUrl);
  const dbPath = parsed.pathname.replace("/", "");
  const options: RedisConnectionOptions = {
    host: parsed.hostname,
    port: parsed.port ? Number(parsed.port) : 6379,
    maxRetriesPerRequest: null
  };

  if (parsed.username) {
    return {
      ...options,
      username: parsed.username,
      ...(parsed.password ? { password: parsed.password } : {}),
      ...(dbPath ? { db: Number(dbPath) } : {})
    };
  }

  if (parsed.password || dbPath) {
    return {
      ...options,
      ...(parsed.password ? { password: parsed.password } : {}),
      ...(dbPath ? { db: Number(dbPath) } : {})
    };
  }

  return options;
}
