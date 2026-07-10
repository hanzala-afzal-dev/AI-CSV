import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { apiKeys } from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

const apiKeyPattern = /^csv_key_[A-Za-z0-9_-]{43}$/;

export interface ApiPrincipal {
  readonly ownerId: string;
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
  secret: string,
  now = new Date()
): Promise<ApiPrincipal | null> {
  const apiKey = readBearerToken(authorizationHeader);
  if (!apiKey) {
    return null;
  }
  const keyHash = hashApiKey(apiKey, secret);
  const rows = await database
    .select({ id: apiKeys.id, ownerId: apiKeys.ownerId })
    .from(apiKeys)
    .where(
      and(
        eq(apiKeys.keyHash, keyHash),
        isNull(apiKeys.revokedAt),
        or(isNull(apiKeys.expiresAt), gt(apiKeys.expiresAt, now))
      )
    )
    .limit(1);
  const key = rows[0];
  if (!key) {
    return null;
  }
  await database.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, key.id));
  return { ownerId: key.ownerId, apiKeyId: key.id };
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
