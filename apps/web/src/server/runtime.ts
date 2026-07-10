import { loadEnv, type AppEnv } from "@agentic-csv/infrastructure/config";
import {
  createDatabaseClient,
  createPgPool,
  type DatabaseClient
} from "@agentic-csv/infrastructure/database";
import { createLogger, type AppLogger } from "@agentic-csv/infrastructure/logging";
import { RedisRateLimiter } from "@agentic-csv/infrastructure/rate-limit";
import { createRedisClient, type RedisClient } from "@agentic-csv/infrastructure/redis";
import { createS3Client, S3ObjectStorage } from "@agentic-csv/infrastructure/storage";
import { DrizzleUnitOfWork } from "@agentic-csv/infrastructure/unit-of-work";

export interface WebRuntime {
  readonly env: AppEnv;
  readonly database: DatabaseClient;
  readonly redis: RedisClient;
  readonly logger: AppLogger;
  readonly objectStorage: S3ObjectStorage;
  readonly unitOfWork: DrizzleUnitOfWork;
  readonly rateLimiter: RedisRateLimiter;
}

function createRuntime(): WebRuntime {
  const env = loadEnv();
  const pool = createPgPool(env);
  const database = createDatabaseClient(pool);
  const redis = createRedisClient(env);
  const s3Client = createS3Client(env);
  const s3PresignClient = createS3Client(env, env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);
  return {
    env,
    database,
    redis,
    logger: createLogger(env).child({ serviceProcess: "web" }),
    objectStorage: new S3ObjectStorage(s3Client, env.S3_BUCKET, s3PresignClient),
    unitOfWork: new DrizzleUnitOfWork(database),
    rateLimiter: new RedisRateLimiter(redis, env.REDIS_KEY_PREFIX)
  };
}

let runtime: WebRuntime | undefined;

export function getRuntime(): WebRuntime {
  runtime ??= createRuntime();
  return runtime;
}

export async function ensureRedisConnected(): Promise<void> {
  const { redis } = getRuntime();
  if (!redis.isOpen) {
    await redis.connect();
  }
}
