import { QdrantClient } from "@qdrant/js-client-rest";
import type { AppEnv } from "../config/env";

export function createQdrantClient(env: AppEnv): QdrantClient {
  return new QdrantClient({
    url: env.QDRANT_URL,
    ...(env.QDRANT_API_KEY ? { apiKey: env.QDRANT_API_KEY } : {})
  });
}

export async function isQdrantReady(env: Pick<AppEnv, "QDRANT_URL" | "QDRANT_API_KEY">) {
  const response = await fetch(
    new URL("/collections", env.QDRANT_URL),
    env.QDRANT_API_KEY ? { headers: { "api-key": env.QDRANT_API_KEY } } : {}
  );

  return response.ok;
}

export async function ensureKnowledgeCollection(
  client: QdrantClient,
  env: Pick<AppEnv, "QDRANT_COLLECTION" | "QDRANT_VECTOR_SIZE">
): Promise<void> {
  const exists = await client.collectionExists(env.QDRANT_COLLECTION);
  if (collectionExists(exists)) {
    return;
  }

  await client.createCollection(env.QDRANT_COLLECTION, {
    vectors: {
      size: env.QDRANT_VECTOR_SIZE,
      distance: "Cosine"
    }
  });
}

function collectionExists(result: boolean | { readonly exists: boolean }): boolean {
  return typeof result === "boolean" ? result : result.exists;
}
