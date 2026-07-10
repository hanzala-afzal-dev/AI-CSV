import { z } from "zod";

const emptyStringAsUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const booleanFromString = z.preprocess((value) => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true") {
      return true;
    }
    if (normalized === "false") {
      return false;
    }
  }
  return value;
}, z.boolean());

const integerFromString = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return value;
  }, schema.int());

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().min(1),
  APP_URL: z.string().url(),
  APP_PORT: integerFromString(z.number().min(1).max(65535)),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
  AUTH_SECRET: z.string().min(32),

  POSTGRES_USER: z.string().min(1),
  POSTGRES_PASSWORD: z.string().min(1),
  POSTGRES_DB: z.string().min(1),
  POSTGRES_PORT: integerFromString(z.number().min(1).max(65535)),
  DATABASE_URL: z.string().url(),
  DATABASE_POOL_MAX: integerFromString(z.number().positive()),
  DATABASE_IDLE_TIMEOUT_MS: integerFromString(z.number().positive()),
  DATABASE_CONNECTION_TIMEOUT_MS: integerFromString(z.number().positive()),

  REDIS_PORT: integerFromString(z.number().min(1).max(65535)),
  REDIS_URL: z.string().url(),
  REDIS_KEY_PREFIX: z.string().min(1),
  QUEUE_PREFIX: z.string().min(1),
  WORKER_CONCURRENCY: integerFromString(z.number().positive()),
  QUEUE_JOB_ATTEMPTS: integerFromString(z.number().positive()),
  QUEUE_BACKOFF_DELAY_MS: integerFromString(z.number().nonnegative()),

  QDRANT_PORT: integerFromString(z.number().min(1).max(65535)),
  QDRANT_GRPC_PORT: integerFromString(z.number().min(1).max(65535)),
  QDRANT_URL: z.string().url(),
  QDRANT_API_KEY: z.preprocess(emptyStringAsUndefined, z.string().optional()),
  QDRANT_COLLECTION: z.string().min(1),
  QDRANT_VECTOR_SIZE: integerFromString(z.number().positive()),

  LOCALSTACK_PORT: integerFromString(z.number().min(1).max(65535)),
  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.preprocess(emptyStringAsUndefined, z.string().url().optional()),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: booleanFromString,
  UPLOAD_MAX_BYTES: integerFromString(z.number().positive()),
  PRESIGNED_URL_TTL_SECONDS: integerFromString(z.number().positive()),

  OPENAI_API_KEY: z.preprocess(emptyStringAsUndefined, z.string().optional()),
  OPENAI_CHAT_MODEL: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().min(1),
  LANGSMITH_TRACING: booleanFromString,
  LANGSMITH_API_KEY: z.preprocess(emptyStringAsUndefined, z.string().optional()),
  LANGSMITH_PROJECT: z.string().min(1),

  RATE_LIMIT_WINDOW_SECONDS: integerFromString(z.number().positive()),
  RATE_LIMIT_MAX_REQUESTS: integerFromString(z.number().positive()),
  RATE_LIMIT_AI_MAX_REQUESTS: integerFromString(z.number().positive()),

  OTEL_SERVICE_NAME: z.string().min(1),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
    emptyStringAsUndefined,
    z.string().url().optional()
  )
});

export type AppEnv = z.infer<typeof envSchema>;

export type ParseEnvResult =
  | { readonly success: true; readonly data: AppEnv }
  | { readonly success: false; readonly error: Error };

export function parseEnv(
  input: NodeJS.ProcessEnv | Record<string, string>
): ParseEnvResult {
  const result = envSchema.safeParse(input);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return {
    success: false,
    error: new Error(formatEnvIssues(result.error))
  };
}

export function loadEnv(input: NodeJS.ProcessEnv = process.env): AppEnv {
  const result = parseEnv(input);
  if (!result.success) {
    throw result.error;
  }

  return result.data;
}

function formatEnvIssues(error: z.ZodError): string {
  const issues = error.issues
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `- ${path}: ${issue.message}`;
    })
    .join("\n");

  return `Invalid environment configuration:\n${issues}`;
}
