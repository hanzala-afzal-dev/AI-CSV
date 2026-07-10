import { parseArgs } from "node:util";
import { generateApiKey } from "../packages/infrastructure/src/auth/api-key";
import { loadEnv } from "../packages/infrastructure/src/config/env";
import {
  createDatabaseClient,
  createPgPool
} from "../packages/infrastructure/src/database/client";
import { apiKeys, owners } from "../packages/infrastructure/drizzle/schema";

const { values } = parseArgs({
  options: {
    "owner-name": { type: "string" },
    "key-name": { type: "string", default: "local-development" }
  }
});

const ownerName = values["owner-name"]?.trim();
const keyName = values["key-name"]?.trim();
if (!ownerName || !keyName) {
  console.error("Usage: pnpm auth:key:create --owner-name <name> [--key-name <name>]");
  process.exit(1);
}

async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPgPool(env);
  const database = createDatabaseClient(pool);

  try {
    const result = await database.transaction(async (transaction) => {
      const createdOwners = await transaction
        .insert(owners)
        .values({ displayName: ownerName })
        .returning({ id: owners.id });
      const owner = createdOwners[0];
      if (!owner) {
        throw new Error("Owner creation returned no row.");
      }
      const generated = generateApiKey(env.AUTH_SECRET);
      await transaction.insert(apiKeys).values({
        ownerId: owner.id,
        name: keyName,
        keyPrefix: generated.keyPrefix,
        keyHash: generated.keyHash
      });
      return { ownerId: owner.id, apiKey: generated.plaintext };
    });

    console.log(`Owner ID: ${result.ownerId}`);
    console.log(`API key (shown once): ${result.apiKey}`);
  } finally {
    await pool.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "API key creation failed.");
  process.exitCode = 1;
});
