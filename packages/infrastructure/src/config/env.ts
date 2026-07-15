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

const numberFromString = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (typeof value === "number") return value;
    if (typeof value === "string" && value.trim() !== "") return Number(value);
    return value;
  }, schema);

const base64EncryptionKey = z.string().refine(isBase64EncryptionKey, {
  message: "Must be a canonical base64-encoded 32-byte key."
});

const previousEncryptionKeys = z.preprocess(
  emptyStringAsUndefined,
  z
    .string()
    .refine(isPreviousKeyMap, {
      message: "Must be a JSON object of key versions to base64-encoded 32-byte keys."
    })
    .optional()
);

export const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_NAME: z.string().min(1),
    APP_URL: z.string().url(),
    APP_PORT: integerFromString(z.number().min(1).max(65535)),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]),
    AUTH_SECRET: z.string().min(32),
    APP_ENCRYPTION_KEY: base64EncryptionKey,
    APP_ENCRYPTION_KEY_VERSION: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/),
    APP_ENCRYPTION_PREVIOUS_KEYS: previousEncryptionKeys,
    SESSION_COOKIE_NAME: z.string().min(1).default("agentic_csv_session"),
    SESSION_IDLE_TTL_SECONDS: integerFromString(z.number().min(300)).default(1800),
    SESSION_ABSOLUTE_TTL_SECONDS: integerFromString(z.number().min(3600)).default(604800),
    EMAIL_VERIFICATION_TTL_SECONDS: integerFromString(z.number().min(300)).default(86400),
    PASSWORD_RESET_TTL_SECONDS: integerFromString(z.number().min(300)).default(3600),
    ARGON2_MEMORY_KIB: integerFromString(z.number().min(19456)).default(19456),
    ARGON2_TIME_COST: integerFromString(z.number().min(2)).default(2),
    ARGON2_PARALLELISM: integerFromString(z.number().min(1)).default(1),
    TRUST_PROXY: booleanFromString.default(false),
    SMTP_HOST: z.string().min(1).default("localhost"),
    SMTP_PORT: integerFromString(z.number().min(1).max(65535)).default(1025),
    MAILPIT_UI_PORT: integerFromString(z.number().min(1).max(65535)).default(8025),
    SMTP_SECURE: booleanFromString.default(false),
    SMTP_USER: z.preprocess(emptyStringAsUndefined, z.string().optional()),
    SMTP_PASSWORD: z.preprocess(emptyStringAsUndefined, z.string().optional()),
    SMTP_FROM: z.string().min(3).default("Agentic CSV Analyst <no-reply@localhost>"),

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
    CSV_MAX_ROWS: integerFromString(z.number().min(1).max(10_000_000)).default(1_000_000),
    CSV_MAX_COLUMNS: integerFromString(z.number().min(1).max(10_000)).default(500),
    CSV_MAX_FIELD_CHARACTERS: integerFromString(
      z.number().min(1).max(10_000_000)
    ).default(1_000_000),
    CSV_MAX_MALFORMED_ROW_RATIO: numberFromString(z.number().min(0).max(0.1)).default(0),
    CSV_PROFILE_TIMEOUT_MS: integerFromString(z.number().min(1_000).max(600_000)).default(
      60_000
    ),
    DUCKDB_MEMORY_LIMIT_MB: integerFromString(z.number().min(64).max(4096)).default(512),
    INGESTION_CLAIM_TTL_SECONDS: integerFromString(z.number().min(30).max(3600)).default(
      300
    ),

    OPENAI_API_BASE_URL: z.string().url().default("https://api.openai.com/v1"),
    OPENAI_VALIDATION_TIMEOUT_MS: integerFromString(
      z.number().min(500).max(30_000)
    ).default(5000),
    DEFAULT_OPENAI_MODEL: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/),
    DEFAULT_REASONING_EFFORT: z.enum([
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max"
    ]),
    OPENAI_EMBEDDING_MODEL: z.string().min(1),
    LANGSMITH_TRACING: booleanFromString,
    LANGSMITH_API_KEY: z.preprocess(emptyStringAsUndefined, z.string().optional()),
    LANGSMITH_PROJECT: z.string().min(1),

    RATE_LIMIT_WINDOW_SECONDS: integerFromString(z.number().positive()),
    RATE_LIMIT_MAX_REQUESTS: integerFromString(z.number().positive()),
    RATE_LIMIT_AI_MAX_REQUESTS: integerFromString(z.number().positive()),
    RATE_LIMIT_LOGIN_MAX_REQUESTS: integerFromString(z.number().positive()).default(10),
    RATE_LIMIT_RECOVERY_MAX_REQUESTS: integerFromString(z.number().positive()).default(5),
    RATE_LIMIT_CREDENTIAL_VALIDATION_MAX_REQUESTS: integerFromString(
      z.number().positive().max(20)
    ).default(5),
    RATE_LIMIT_CHAT_SUBMISSION_MAX_REQUESTS: integerFromString(
      z.number().positive().max(100)
    ).default(20),
    RATE_LIMIT_SSE_CONNECTION_MAX_REQUESTS: integerFromString(
      z.number().positive().max(100)
    ).default(30),
    RATE_LIMIT_UPLOAD_INTENT_MAX_REQUESTS: integerFromString(
      z.number().positive().max(100)
    ).default(10),
    RATE_LIMIT_UPLOAD_COMPLETION_MAX_REQUESTS: integerFromString(
      z.number().positive().max(200)
    ).default(20),
    SSE_MAX_CONNECTIONS_PER_USER: integerFromString(z.number().min(1).max(10)).default(3),
    SSE_CONNECTION_LEASE_SECONDS: integerFromString(z.number().min(10).max(120)).default(
      35
    ),

    OTEL_SERVICE_NAME: z.string().min(1),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.preprocess(
      emptyStringAsUndefined,
      z.string().url().optional()
    )
  })
  .superRefine((env, context) => {
    const providerUrl = new URL(env.OPENAI_API_BASE_URL);
    if (env.NODE_ENV === "production" && providerUrl.protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["OPENAI_API_BASE_URL"],
        message: "Must use HTTPS in production."
      });
    }
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

function isBase64EncryptionKey(value: string): boolean {
  try {
    const decoded = Buffer.from(value, "base64");
    return decoded.length === 32 && decoded.toString("base64") === value;
  } catch {
    return false;
  }
}

function isPreviousKeyMap(value: string): boolean {
  try {
    const parsed = JSON.parse(value) as unknown;
    return (
      typeof parsed === "object" &&
      parsed !== null &&
      !Array.isArray(parsed) &&
      Object.entries(parsed).every(
        ([version, key]) =>
          /^[A-Za-z0-9._-]{1,64}$/.test(version) &&
          typeof key === "string" &&
          isBase64EncryptionKey(key)
      )
    );
  } catch {
    return false;
  }
}
