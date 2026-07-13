import { describe, expect, it } from "vitest";
import { parseEnv } from "../src";

const validEnv = {
  NODE_ENV: "test",
  APP_NAME: "Agentic CSV Analyst Test",
  APP_URL: "http://localhost:3000",
  APP_PORT: "3000",
  LOG_LEVEL: "silent",
  AUTH_SECRET: "test-secret-at-least-32-characters",
  APP_ENCRYPTION_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  APP_ENCRYPTION_KEY_VERSION: "test-v1",
  APP_ENCRYPTION_PREVIOUS_KEYS: "",
  POSTGRES_USER: "agentic_csv_test",
  POSTGRES_PASSWORD: "agentic_csv_test_password",
  POSTGRES_DB: "agentic_csv_test",
  POSTGRES_PORT: "5433",
  DATABASE_URL:
    "postgres://agentic_csv_test:agentic_csv_test_password@localhost:5433/agentic_csv_test",
  DATABASE_POOL_MAX: "2",
  DATABASE_IDLE_TIMEOUT_MS: "1000",
  DATABASE_CONNECTION_TIMEOUT_MS: "1000",
  REDIS_PORT: "6380",
  REDIS_URL: "redis://localhost:6380",
  REDIS_KEY_PREFIX: "agentic-csv-test",
  QUEUE_PREFIX: "agentic-csv-test",
  WORKER_CONCURRENCY: "1",
  QUEUE_JOB_ATTEMPTS: "1",
  QUEUE_BACKOFF_DELAY_MS: "100",
  QDRANT_PORT: "6335",
  QDRANT_GRPC_PORT: "6336",
  QDRANT_URL: "http://localhost:6335",
  QDRANT_API_KEY: "",
  QDRANT_COLLECTION: "knowledge_documents_test",
  QDRANT_VECTOR_SIZE: "1536",
  LOCALSTACK_PORT: "4567",
  S3_ENDPOINT: "http://localhost:4567",
  S3_PUBLIC_ENDPOINT: "http://localhost:4567",
  S3_REGION: "us-east-1",
  S3_BUCKET: "agentic-csv-test",
  S3_ACCESS_KEY_ID: "test",
  S3_SECRET_ACCESS_KEY: "test",
  S3_FORCE_PATH_STYLE: "true",
  UPLOAD_MAX_BYTES: "10485760",
  PRESIGNED_URL_TTL_SECONDS: "60",
  OPENAI_API_BASE_URL: "https://api.openai.com/v1",
  OPENAI_VALIDATION_TIMEOUT_MS: "1000",
  DEFAULT_OPENAI_MODEL: "gpt-5.5",
  DEFAULT_REASONING_EFFORT: "medium",
  OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
  LANGSMITH_TRACING: "false",
  LANGSMITH_API_KEY: "",
  LANGSMITH_PROJECT: "agentic-csv-test",
  RATE_LIMIT_WINDOW_SECONDS: "60",
  RATE_LIMIT_MAX_REQUESTS: "100",
  RATE_LIMIT_AI_MAX_REQUESTS: "10",
  OTEL_SERVICE_NAME: "agentic-csv-analyst-test",
  OTEL_EXPORTER_OTLP_ENDPOINT: ""
};

describe("parseEnv", () => {
  it("parses valid environment variables and converts primitive types", () => {
    const result = parseEnv(validEnv);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.APP_PORT).toBe(3000);
      expect(result.data.S3_FORCE_PATH_STYLE).toBe(true);
      expect(result.data.APP_ENCRYPTION_PREVIOUS_KEYS).toBeUndefined();
    }
  });

  it("fails clearly for short auth secrets", () => {
    const result = parseEnv({ ...validEnv, AUTH_SECRET: "short" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("AUTH_SECRET");
    }
  });

  it("rejects misspelled boolean values instead of coercing them to false", () => {
    const result = parseEnv({ ...validEnv, S3_FORCE_PATH_STYLE: "treu" });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("S3_FORCE_PATH_STYLE");
    }
  });

  it("rejects malformed encryption keys and insecure production provider URLs", () => {
    expect(
      parseEnv({ ...validEnv, APP_ENCRYPTION_KEY: "not-a-32-byte-key" }).success
    ).toBe(false);
    expect(
      parseEnv({
        ...validEnv,
        NODE_ENV: "production",
        OPENAI_API_BASE_URL: "http://provider.internal/v1"
      }).success
    ).toBe(false);
  });
});
