import { QdrantClient } from "@qdrant/js-client-rest";
import { MemoryError, type SemanticVectorStore } from "@agentic-csv/application";
import type { AppEnv } from "../config/env";

export function createQdrantClient(env: AppEnv): QdrantClient {
  return new QdrantClient({
    url: env.QDRANT_URL,
    ...(env.QDRANT_API_KEY ? { apiKey: env.QDRANT_API_KEY } : {})
  });
}

export async function isQdrantReady(
  env: Pick<AppEnv, "QDRANT_URL" | "QDRANT_API_KEY">,
  timeoutMs = 2_000
) {
  const response = await fetch(new URL("/collections", env.QDRANT_URL), {
    signal: AbortSignal.timeout(timeoutMs),
    ...(env.QDRANT_API_KEY ? { headers: { "api-key": env.QDRANT_API_KEY } } : {})
  });

  return response.ok;
}

export async function ensureKnowledgeCollection(
  client: QdrantClient,
  env: Pick<AppEnv, "QDRANT_COLLECTION" | "QDRANT_VECTOR_SIZE">
): Promise<void> {
  const exists = await client.collectionExists(env.QDRANT_COLLECTION);
  if (!collectionExists(exists)) {
    await client.createCollection(env.QDRANT_COLLECTION, {
      vectors: {
        size: env.QDRANT_VECTOR_SIZE,
        distance: "Cosine"
      }
    });
  }
  await ensurePayloadIndexes(client, env.QDRANT_COLLECTION);
}

export class QdrantSemanticVectorStore implements SemanticVectorStore {
  private readiness: Promise<void> | null = null;

  public constructor(
    private readonly client: QdrantClient,
    private readonly collection: string,
    private readonly vectorSize: number
  ) {}

  public ensureReady(): Promise<void> {
    if (!this.readiness) {
      this.readiness = ensureKnowledgeCollection(this.client, {
        QDRANT_COLLECTION: this.collection,
        QDRANT_VECTOR_SIZE: this.vectorSize
      }).catch((error: unknown) => {
        this.readiness = null;
        throw error;
      });
    }
    return this.readiness;
  }

  public async upsert(
    points: Parameters<SemanticVectorStore["upsert"]>[0]
  ): Promise<void> {
    for (const point of points) this.assertVector(point.vector);
    await this.client.upsert(this.collection, {
      wait: true,
      ordering: "medium",
      points: points.map((point) => ({
        id: point.id,
        vector: [...point.vector],
        payload: { ...point.payload }
      }))
    });
  }

  public async search(
    input: Parameters<SemanticVectorStore["search"]>[0]
  ): Promise<Awaited<ReturnType<SemanticVectorStore["search"]>>> {
    requireUuid(input.userId, "userId");
    requireUuid(input.datasetId, "datasetId");
    requireUuid(input.datasetVersionId, "datasetVersionId");
    this.assertVector(input.vector);
    const response = await this.client.query(this.collection, {
      query: [...input.vector],
      limit: input.limit,
      score_threshold: input.scoreThreshold,
      with_payload: ["recordId", "recordType"],
      with_vector: false,
      filter: {
        must: [
          { key: "userId", match: { value: input.userId } },
          { key: "datasetId", match: { value: input.datasetId } },
          { key: "datasetVersionId", match: { value: input.datasetVersionId } },
          { key: "status", match: { value: "active" } }
        ]
      }
    });
    return response.points.flatMap((point) => {
      const recordId = payloadString(point.payload, "recordId");
      const recordType = payloadString(point.payload, "recordType");
      if (
        !recordId ||
        !isUuid(recordId) ||
        (recordType !== "semantic_document" && recordType !== "memory_record") ||
        !Number.isFinite(point.score)
      ) {
        return [];
      }
      return [{ recordId, recordType, score: point.score }];
    });
  }

  public async delete(
    input: Parameters<SemanticVectorStore["delete"]>[0]
  ): Promise<void> {
    requireUuid(input.userId, "userId");
    if (input.conversationId) requireUuid(input.conversationId, "conversationId");
    if (input.datasetId) requireUuid(input.datasetId, "datasetId");
    await this.client.delete(this.collection, {
      wait: true,
      ordering: "medium",
      filter: {
        must: [
          { key: "userId", match: { value: input.userId } },
          ...(input.conversationId
            ? [{ key: "conversationId", match: { value: input.conversationId } }]
            : []),
          ...(input.datasetId
            ? [{ key: "datasetId", match: { value: input.datasetId } }]
            : [])
        ]
      }
    });
  }

  private assertVector(vector: readonly number[]): void {
    if (
      vector.length !== this.vectorSize ||
      vector.some((value) => !Number.isFinite(value))
    ) {
      throw new MemoryError(
        "MEMORY_CONTEXT_INVALID",
        "Embedding dimensions do not match the configured vector collection."
      );
    }
  }
}

function collectionExists(result: boolean | { readonly exists: boolean }): boolean {
  return typeof result === "boolean" ? result : result.exists;
}

const payloadIndexes = {
  userId: "uuid",
  datasetId: "uuid",
  datasetVersionId: "uuid",
  conversationId: "uuid",
  documentType: "keyword",
  recordType: "keyword",
  recordId: "uuid",
  sourceId: "uuid",
  contentHash: "keyword",
  schemaVersion: "integer",
  embeddingModel: "keyword",
  status: "keyword"
} as const;

async function ensurePayloadIndexes(
  client: QdrantClient,
  collection: string
): Promise<void> {
  const info = await client.getCollection(collection);
  const current = info.payload_schema ?? {};
  for (const [fieldName, fieldSchema] of Object.entries(payloadIndexes)) {
    if (fieldName in current) continue;
    await client.createPayloadIndex(collection, {
      wait: true,
      field_name: fieldName,
      field_schema: fieldSchema
    });
  }
}

function payloadString(
  payload: Record<string, unknown> | null | undefined,
  key: string
): string | null {
  const value = payload?.[key];
  return typeof value === "string" ? value : null;
}

function requireUuid(value: string, field: string): void {
  if (!isUuid(value)) {
    throw new MemoryError(
      "MEMORY_CONTEXT_INVALID",
      `${field} must be a non-empty trusted UUID.`
    );
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}
