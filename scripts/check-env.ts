import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseEnv } from "../packages/infrastructure/src/config/env";

const optionalLocalKeys = new Set([
  "MEMORY_RETRIEVAL_TOP_K",
  "MEMORY_RETRIEVAL_SCORE_THRESHOLD",
  "MEMORY_MAX_CONTEXT_CHARACTERS",
  "MEMORY_CACHE_TTL_SECONDS",
  "MEMORY_EMBEDDING_BATCH_SIZE",
  "MEMORY_EMBEDDING_MAX_CHARACTERS",
  "MEMORY_EMBEDDING_TIMEOUT_MS"
]);

const defaultEnvFile = existsSync(resolve(process.cwd(), ".env"))
  ? ".env"
  : ".env.example";
const envFile = resolve(process.cwd(), process.env.ENV_FILE ?? defaultEnvFile);

if (!existsSync(envFile)) {
  console.error(`Environment file not found: ${envFile}`);
  process.exit(1);
}

function readEnvFile(path: string): Record<string, string> {
  return Object.fromEntries(
    readFileSync(path, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator === -1) {
          return [line, ""];
        }

        return [line.slice(0, separator), line.slice(separator + 1)];
      })
  );
}

const parsed = readEnvFile(envFile);

const result = parseEnv(parsed);

if (!result.success) {
  console.error(result.error.message);
  process.exit(1);
}

if (envFile === resolve(process.cwd(), ".env")) {
  const example = readEnvFile(resolve(process.cwd(), ".env.example"));
  const missingKeys = Object.keys(example).filter((key) => !(key in parsed));
  const requiredKeys = missingKeys.filter((key) => !optionalLocalKeys.has(key));
  const defaultedKeys = missingKeys.filter((key) => optionalLocalKeys.has(key));

  if (requiredKeys.length > 0) {
    console.error(
      `Environment file is missing required keys from .env.example: ${requiredKeys.join(", ")}`
    );
    process.exit(1);
  }

  if (defaultedKeys.length > 0) {
    console.warn(
      `Environment file omits optional keys; application defaults will be used: ${defaultedKeys.join(", ")}`
    );
  }
}

console.log(`Environment validation passed for ${envFile}`);
