import { parseArgs } from "node:util";
import { generateApiKey } from "../packages/infrastructure/src/auth/api-key";
import { loadEnv } from "../packages/infrastructure/src/config/env";
import {
  createDatabaseClient,
  createPgPool
} from "../packages/infrastructure/src/database/client";
import { apiKeys, users } from "../packages/infrastructure/drizzle/schema";

const { values } = parseArgs({
  options: {
    "user-name": { type: "string" },
    "key-name": { type: "string", default: "local-development" }
  }
});

const userName = values["user-name"]?.trim();
const keyName = values["key-name"]?.trim();
if (!userName || !keyName) {
  console.error("Usage: pnpm auth:key:create --user-name <name> [--key-name <name>]");
  process.exit(1);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPgPool({
    ...env,
    DATABASE_URL: process.env.MIGRATION_DATABASE_URL ?? env.DATABASE_URL
  });
  const database = createDatabaseClient(pool);

  try {
    const result = await database.transaction(async (transaction) => {
      const createdUsers = await transaction
        .insert(users)
        .values({ displayName: userName })
        .returning({ id: users.id });
      const user = createdUsers[0];
      if (!user) {
        throw new Error("User creation returned no row.");
      }
      const generated = generateApiKey(env.AUTH_SECRET);
      await transaction.insert(apiKeys).values({
        userId: user.id,
        name: keyName,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash
      });
      return { userId: user.id, apiKey: generated.plaintext };
    });

    console.log(`User ID: ${result.userId}`);
    console.log(`API key (shown once): ${result.apiKey}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "API key creation failed.");
  process.exitCode = 1;
});
