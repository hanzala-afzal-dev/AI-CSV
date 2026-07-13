import { IdentityService } from "@agentic-csv/application";
import { loadEnv, type AppEnv } from "@agentic-csv/infrastructure/config";
import {
  createDatabaseClient,
  createPgPool,
  type DatabaseClient
} from "@agentic-csv/infrastructure/database";
import {
  Argon2PasswordHasher,
  HmacSecureTokenService,
  PostgresIdentityRepository,
  SmtpIdentityMailer
} from "@agentic-csv/infrastructure/identity";
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
  readonly identityService: IdentityService;
}

function createRuntime(): WebRuntime {
  const env = loadEnv();
  const pool = createPgPool(env);
  const database = createDatabaseClient(pool);
  const redis = createRedisClient(env);
  const s3Client = createS3Client(env);
  const s3PresignClient = createS3Client(env, env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT);
  const identityRepository = new PostgresIdentityRepository(database);
  const logger = createLogger(env).child({ serviceProcess: "web" });
  const passwordHasher = new Argon2PasswordHasher({
    memoryCost: env.ARGON2_MEMORY_KIB,
    timeCost: env.ARGON2_TIME_COST,
    parallelism: env.ARGON2_PARALLELISM
  });
  return {
    env,
    database,
    redis,
    logger,
    objectStorage: new S3ObjectStorage(s3Client, env.S3_BUCKET, s3PresignClient),
    unitOfWork: new DrizzleUnitOfWork(database),
    rateLimiter: new RedisRateLimiter(redis, env.REDIS_KEY_PREFIX),
    identityService: new IdentityService(
      identityRepository,
      passwordHasher,
      new HmacSecureTokenService(env.AUTH_SECRET),
      new SmtpIdentityMailer(env, logger),
      {
        sessionIdleTtlSeconds: env.SESSION_IDLE_TTL_SECONDS,
        sessionAbsoluteTtlSeconds: env.SESSION_ABSOLUTE_TTL_SECONDS,
        verificationTtlSeconds: env.EMAIL_VERIFICATION_TTL_SECONDS,
        passwordResetTtlSeconds: env.PASSWORD_RESET_TTL_SECONDS
      }
    )
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
