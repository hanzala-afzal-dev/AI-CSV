import pino from "pino";
import type { AppEnv } from "../config/env";

export const redactionPaths = [
  "AUTH_SECRET",
  "APP_ENCRYPTION_KEY",
  "APP_ENCRYPTION_PREVIOUS_KEYS",
  "POSTGRES_PASSWORD",
  "DATABASE_URL",
  "QDRANT_API_KEY",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "OPENAI_API_KEY",
  "LANGSMITH_API_KEY",
  "SMTP_PASSWORD",
  "authorization",
  "cookie",
  "apiKey",
  "credential",
  "ciphertext",
  "nonce",
  "authTag",
  "encryptedDataKey",
  "fingerprint",
  "password",
  "secret",
  "sessionToken",
  "csrfToken",
  "token",
  "signedUrl",
  "uploadUrl",
  "headers.authorization",
  "headers.cookie",
  "req.headers.authorization",
  "req.headers.cookie",
  "*.authorization",
  "*.password",
  "*.sessionToken",
  "*.csrfToken",
  "*.token",
  "*.apiKey",
  "*.credential",
  "*.ciphertext",
  "*.nonce",
  "*.authTag",
  "*.encryptedDataKey",
  "*.fingerprint",
  "*.secret",
  "*.signedUrl",
  "*.uploadUrl"
] as const;

export type AppLogger = pino.Logger;

export function createLogger(env: Pick<AppEnv, "APP_NAME" | "LOG_LEVEL" | "NODE_ENV">) {
  return pino({
    name: env.APP_NAME,
    level: env.LOG_LEVEL,
    redact: {
      paths: [...redactionPaths],
      censor: "[redacted]"
    },
    base: {
      service: env.APP_NAME,
      environment: env.NODE_ENV
    }
  });
}

export function createSilentLogger(): AppLogger {
  return pino({ level: "silent" });
}
