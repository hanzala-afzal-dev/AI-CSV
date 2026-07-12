import { createHmac, randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import type { DatabaseClient } from "../database/client";

const apiKeyPattern = /^csv_key_[A-Za-z0-9_-]{43}$/;

export interface ApiPrincipal {
  readonly userId: string;
  readonly apiKeyId: string;
}

export function generateApiKey(secret: string): {
  readonly plaintext: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
} {
  const plaintext = `csv_key_${randomBytes(32).toString("base64url")}`;
  return {
    plaintext,
    keyPrefix: plaintext.slice(0, 20),
    keyHash: hashApiKey(plaintext, secret)
  };
}

export function hashApiKey(apiKey: string, secret: string): string {
  return createHmac("sha256", secret).update(apiKey).digest("hex");
}

export async function authenticateApiKey(
  database: DatabaseClient,
  authorizationHeader: string | null,
  secret: string
): Promise<ApiPrincipal | null> {
  const apiKey = readBearerToken(authorizationHeader);
  if (!apiKey) {
    return null;
  }
  const keyHash = hashApiKey(apiKey, secret);
  const result = await database.execute<{ id: string; user_id: string }>(
    sql`select id, user_id from public.authenticate_api_key(${keyHash})`
  );
  const key = result.rows[0];
  if (!key) {
    return null;
  }
  return { userId: key.user_id, apiKeyId: key.id };
}

function readBearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer ([^\s]+)$/.exec(header);
  if (!match?.[1] || !apiKeyPattern.test(match[1])) {
    return null;
  }
  return match[1];
}
