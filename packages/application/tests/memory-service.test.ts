import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { KnowledgeIndexJobPayload } from "@agentic-csv/contracts";
import {
  MemoryDeletionService,
  MemoryIndexingService,
  MemoryRetrievalService,
  type MemoryIndexDocument,
  type MemoryRepository,
  type MemoryRetrievalCache,
  type SemanticVectorStore,
  type UserTextEmbeddingProvider
} from "../src";

const userId = randomUUID();
const conversationId = randomUUID();
const datasetId = randomUUID();
const datasetVersionId = randomUUID();
const memoryId = randomUUID();
const messageId = randomUUID();
const columnId = randomUUID();

describe("MemoryRetrievalService", () => {
  it("uses the authoritative confirmed definition when semantic retrieval degrades", async () => {
    const fixture = retrievalFixture();
    fixture.embeddings.embed.mockRejectedValueOnce(new Error("provider unavailable"));
    const degraded = vi.fn();
    const service = new MemoryRetrievalService(
      fixture.repository,
      fixture.embeddings,
      fixture.vectors,
      fixture.cache,
      { topK: 8, scoreThreshold: 0.35, maxContextCharacters: 8_000 },
      degraded
    );

    const result = await service.retrieve(retrievalInput("Total revenue by region"));

    expect(result.items).toEqual([
      expect.objectContaining({
        sourceId: messageId,
        confidence: "confirmed",
        definition: expect.objectContaining({ alias: "revenue", columnId })
      })
    ]);
    expect(fixture.vectors.search).not.toHaveBeenCalled();
    expect(fixture.cache.set).toHaveBeenCalledWith(
      expect.objectContaining({ revision: 4 }),
      result
    );
    expect(degraded).toHaveBeenCalledTimes(1);
  });

  it("passes mandatory tenant and active-version filters to vector search", async () => {
    const fixture = retrievalFixture();
    fixture.repository.findConfirmedDefinitions.mockResolvedValueOnce([]);
    fixture.vectors.search.mockResolvedValueOnce([
      { recordType: "semantic_document", recordId: randomUUID(), score: 0.82 }
    ] as never);
    const service = new MemoryRetrievalService(
      fixture.repository,
      fixture.embeddings,
      fixture.vectors,
      fixture.cache,
      { topK: 6, scoreThreshold: 0.4, maxContextCharacters: 2_000 }
    );

    await service.retrieve(retrievalInput("Explain the columns"));

    expect(fixture.vectors.search).toHaveBeenCalledWith({
      userId,
      datasetId,
      datasetVersionId,
      vector: [0.1, 0.2],
      limit: 6,
      scoreThreshold: 0.4
    });
    expect(fixture.repository.hydrateVectorHits).toHaveBeenCalledWith(
      expect.objectContaining({ userId, datasetId, datasetVersionId })
    );
  });

  it("returns a revision-matched cache entry without calling the provider", async () => {
    const fixture = retrievalFixture();
    const cached = { version: 1 as const, revision: 4, items: [] };
    fixture.cache.get.mockResolvedValueOnce(cached as never);
    const service = new MemoryRetrievalService(
      fixture.repository,
      fixture.embeddings,
      fixture.vectors,
      fixture.cache,
      { topK: 8, scoreThreshold: 0.35, maxContextCharacters: 8_000 }
    );

    await expect(service.retrieve(retrievalInput("Revenue"))).resolves.toEqual(cached);
    expect(fixture.embeddings.embed).not.toHaveBeenCalled();
    expect(fixture.repository.findConfirmedDefinitions).not.toHaveBeenCalled();
  });
});

describe("MemoryIndexingService", () => {
  it("skips an already indexed document for the current embedding model", async () => {
    const document = indexDocument({
      indexStatus: "indexed",
      indexedEmbeddingModel: "text-embedding-test"
    });
    const fixture = indexingFixture(document);
    const service = new MemoryIndexingService(
      fixture.repository,
      fixture.embeddings,
      fixture.vectors,
      { batchSize: 10 }
    );

    await expect(service.process(indexPayload())).resolves.toBe(0);
    expect(fixture.embeddings.embed).not.toHaveBeenCalled();
    expect(fixture.vectors.upsert).not.toHaveBeenCalled();
  });

  it("upserts a stable point with tenant, version and source metadata", async () => {
    const document = indexDocument();
    const fixture = indexingFixture(document);
    const service = new MemoryIndexingService(
      fixture.repository,
      fixture.embeddings,
      fixture.vectors,
      { batchSize: 10 },
      () => new Date("2026-08-09T00:00:00.000Z")
    );

    await expect(service.process(indexPayload())).resolves.toBe(1);
    expect(fixture.vectors.upsert).toHaveBeenCalledWith([
      expect.objectContaining({
        id: document.pointId,
        payload: expect.objectContaining({
          userId,
          datasetId,
          datasetVersionId,
          conversationId,
          sourceId: messageId,
          contentHash: "a".repeat(64),
          embeddingModel: "text-embedding-test"
        })
      })
    ]);
    expect(fixture.repository.markIndexed).toHaveBeenCalledOnce();
  });
});

describe("MemoryDeletionService", () => {
  it("deletes only the trusted conversation scope", async () => {
    const vectors = vectorStore();
    const service = new MemoryDeletionService(vectors);

    await service.process({
      version: 1,
      jobName: "knowledge.delete.v1",
      correlationId: randomUUID(),
      userId,
      idempotencyKey: `conversation-delete:${conversationId}`,
      scope: "conversation",
      conversationId
    });

    expect(vectors.ensureReady).toHaveBeenCalledOnce();
    expect(vectors.delete).toHaveBeenCalledWith({ userId, conversationId });
  });
});

function retrievalInput(question: string) {
  return { userId, conversationId, datasetId, datasetVersionId, question };
}

function confirmedDefinition() {
  return {
    sourceId: messageId,
    documentType: "business_rule" as const,
    content: "Confirmed dataset definition: revenue means net_revenue.",
    score: 1,
    confidence: "confirmed" as const,
    datasetId,
    datasetVersionId,
    definition: {
      version: 1 as const,
      alias: "revenue",
      columnId,
      columnName: "net_revenue",
      clarificationId: randomUUID(),
      sourceMessageId: messageId
    }
  };
}

function retrievalFixture() {
  const repository = {
    loadIndexDocuments: vi.fn(),
    markIndexing: vi.fn(),
    markIndexed: vi.fn(),
    markIndexFailed: vi.fn(),
    getRevision: vi.fn(async () => 4),
    findConfirmedDefinitions: vi.fn(async () => [confirmedDefinition()]),
    hydrateVectorHits: vi.fn(async () => [])
  } satisfies MemoryRepository;
  const embeddings = {
    modelId: "text-embedding-test",
    embed: vi.fn(async () => [[0.1, 0.2]])
  } satisfies UserTextEmbeddingProvider;
  return {
    repository,
    embeddings,
    vectors: vectorStore(),
    cache: {
      get: vi.fn(async () => null),
      set: vi.fn(async () => undefined)
    } satisfies MemoryRetrievalCache
  };
}

function indexPayload(): KnowledgeIndexJobPayload {
  return {
    version: 1,
    jobName: "knowledge.index.v1",
    correlationId: randomUUID(),
    userId,
    idempotencyKey: `confirmed-definition:${memoryId}`,
    source: "confirmed-definition",
    datasetId,
    datasetVersionId,
    memoryId
  };
}

function indexDocument(
  overrides: Partial<MemoryIndexDocument> = {}
): MemoryIndexDocument {
  return {
    recordId: memoryId,
    recordType: "memory_record",
    pointId: randomUUID(),
    sourceId: messageId,
    userId,
    datasetId,
    datasetVersionId,
    conversationId,
    documentType: "business_rule",
    content: "Confirmed dataset definition: revenue means net_revenue.",
    contentHash: "a".repeat(64),
    schemaVersion: 1,
    confidence: "confirmed",
    definition: confirmedDefinition().definition,
    indexStatus: "pending",
    indexedEmbeddingModel: null,
    ...overrides
  };
}

function indexingFixture(document: MemoryIndexDocument) {
  const repository = {
    loadIndexDocuments: vi.fn(async () => [document]),
    markIndexing: vi.fn(async () => undefined),
    markIndexed: vi.fn(async () => undefined),
    markIndexFailed: vi.fn(async () => undefined),
    getRevision: vi.fn(),
    findConfirmedDefinitions: vi.fn(),
    hydrateVectorHits: vi.fn()
  } satisfies MemoryRepository;
  return {
    repository,
    embeddings: {
      modelId: "text-embedding-test",
      embed: vi.fn(async () => [[0.1, 0.2]])
    } satisfies UserTextEmbeddingProvider,
    vectors: vectorStore()
  };
}

function vectorStore() {
  return {
    ensureReady: vi.fn(async () => undefined),
    upsert: vi.fn(async () => undefined),
    search: vi.fn(async () => []),
    delete: vi.fn(async () => undefined)
  } satisfies SemanticVectorStore;
}
