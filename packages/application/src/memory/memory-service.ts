import type {
  KnowledgeDeleteJobPayload,
  KnowledgeIndexJobPayload,
  MemoryRetrievalResultContract,
  RetrievedMemoryContextContract
} from "@agentic-csv/contracts";
import { memoryRetrievalResultSchema } from "@agentic-csv/contracts";
import { MemoryError } from "./memory-error";
import type {
  MemoryIndexDocument,
  MemoryRepository,
  MemoryRetrievalCache,
  MemoryRetrievalInput,
  MemoryVectorPoint,
  SemanticMemoryRetriever,
  SemanticVectorStore,
  UserTextEmbeddingProvider
} from "./ports";

export interface MemoryRetrievalPolicy {
  readonly topK: number;
  readonly scoreThreshold: number;
  readonly maxContextCharacters: number;
}

export class MemoryRetrievalService implements SemanticMemoryRetriever {
  private readonly inFlight = new Map<string, Promise<MemoryRetrievalResultContract>>();

  public constructor(
    private readonly repository: MemoryRepository,
    private readonly embeddings: UserTextEmbeddingProvider,
    private readonly vectors: SemanticVectorStore,
    private readonly cache: MemoryRetrievalCache,
    private readonly policy: MemoryRetrievalPolicy,
    private readonly onDegraded?: (error: unknown) => void
  ) {}

  public async retrieve(
    input: MemoryRetrievalInput
  ): Promise<MemoryRetrievalResultContract> {
    const revision = await this.repository.getRevision(input);
    let cached: MemoryRetrievalResultContract | null = null;
    try {
      cached = await this.cache.get({ ...input, revision });
    } catch (error) {
      this.reportDegraded(error);
    }
    if (cached) return cached;

    const key = [
      input.userId,
      input.datasetVersionId,
      revision,
      normalize(input.question)
    ].join(":");
    const existing = this.inFlight.get(key);
    if (existing) return existing;

    const pending = this.retrieveUncached(input, revision).finally(() => {
      this.inFlight.delete(key);
    });
    this.inFlight.set(key, pending);
    return pending;
  }

  private async retrieveUncached(
    input: MemoryRetrievalInput,
    revision: number
  ): Promise<MemoryRetrievalResultContract> {
    const definitions = matchingDefinitions(
      await this.repository.findConfirmedDefinitions(input),
      input.question
    );
    let semantic: readonly RetrievedMemoryContextContract[] = [];
    try {
      const [vector] = await this.embeddings.embed(input.userId, [input.question]);
      if (!vector)
        throw new MemoryError("MEMORY_CONTEXT_INVALID", "Embedding is missing.");
      const hits = await this.vectors.search({
        userId: input.userId,
        datasetId: input.datasetId,
        datasetVersionId: input.datasetVersionId,
        vector,
        limit: this.policy.topK,
        scoreThreshold: this.policy.scoreThreshold
      });
      semantic = await this.repository.hydrateVectorHits({ ...input, hits });
    } catch (error) {
      this.reportDegraded(error);
    }

    const result = memoryRetrievalResultSchema.parse({
      version: 1,
      revision,
      items: boundContext([...definitions, ...semantic], this.policy)
    });
    try {
      await this.cache.set({ ...input, revision }, result);
    } catch (error) {
      this.reportDegraded(error);
    }
    return result;
  }

  private reportDegraded(error: unknown): void {
    try {
      this.onDegraded?.(error);
    } catch {
      // Retrieval diagnostics must not replace the PostgreSQL fallback.
    }
  }
}

export interface MemoryIndexingPolicy {
  readonly batchSize: number;
}

export class MemoryIndexingService {
  public constructor(
    private readonly repository: MemoryRepository,
    private readonly embeddings: UserTextEmbeddingProvider,
    private readonly vectors: SemanticVectorStore,
    private readonly policy: MemoryIndexingPolicy,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async process(payload: KnowledgeIndexJobPayload): Promise<number> {
    const loaded = await this.repository.loadIndexDocuments(payload);
    const documents = loaded.filter(
      (document) =>
        document.indexStatus !== "indexed" ||
        document.indexedEmbeddingModel !== this.embeddings.modelId
    );
    if (documents.length === 0) return 0;

    await this.repository.markIndexing({
      userId: payload.userId,
      documents,
      occurredAt: this.now()
    });
    try {
      await this.vectors.ensureReady();
      for (let offset = 0; offset < documents.length; offset += this.policy.batchSize) {
        const batch = documents.slice(offset, offset + this.policy.batchSize);
        const vectors = await this.embeddings.embed(
          payload.userId,
          batch.map((document) => document.content)
        );
        if (vectors.length !== batch.length) {
          throw new MemoryError(
            "MEMORY_EMBEDDING_UNAVAILABLE",
            "The embedding provider returned an incomplete batch."
          );
        }
        await this.vectors.upsert(
          toVectorPoints(batch, vectors, this.embeddings.modelId)
        );
      }
      await this.repository.markIndexed({
        userId: payload.userId,
        datasetId: payload.datasetId,
        datasetVersionId: payload.datasetVersionId,
        documents,
        embeddingModel: this.embeddings.modelId,
        occurredAt: this.now()
      });
      return documents.length;
    } catch (error) {
      await this.repository.markIndexFailed({
        userId: payload.userId,
        documents,
        failureCode: safeFailureCode(error),
        occurredAt: this.now()
      });
      if (error instanceof MemoryError) throw error;
      throw new MemoryError(
        "MEMORY_INDEX_UNAVAILABLE",
        "Semantic memory indexing could not be completed.",
        { cause: error }
      );
    }
  }
}

export class MemoryDeletionService {
  public constructor(private readonly vectors: SemanticVectorStore) {}

  public async process(payload: KnowledgeDeleteJobPayload): Promise<void> {
    await this.vectors.ensureReady();
    switch (payload.scope) {
      case "conversation":
        await this.vectors.delete({
          userId: payload.userId,
          conversationId: requiredScopeId(payload.conversationId)
        });
        break;
      case "dataset":
        await this.vectors.delete({
          userId: payload.userId,
          datasetId: requiredScopeId(payload.datasetId)
        });
        break;
      case "user":
        await this.vectors.delete({ userId: payload.userId });
        break;
    }
  }
}

function toVectorPoints(
  documents: readonly MemoryIndexDocument[],
  vectors: readonly (readonly number[])[],
  embeddingModel: string
): MemoryVectorPoint[] {
  return documents.map((document, index) => {
    const vector = vectors[index];
    if (!vector) {
      throw new MemoryError(
        "MEMORY_EMBEDDING_UNAVAILABLE",
        "The embedding provider returned an incomplete batch."
      );
    }
    return {
      id: document.pointId,
      vector,
      payload: {
        userId: document.userId,
        datasetId: document.datasetId,
        datasetVersionId: document.datasetVersionId,
        conversationId: document.conversationId,
        documentType: document.documentType,
        recordType: document.recordType,
        recordId: document.recordId,
        sourceId: document.sourceId,
        contentHash: document.contentHash,
        schemaVersion: document.schemaVersion,
        embeddingModel,
        status: "active"
      }
    };
  });
}

function requiredScopeId(value: string | undefined): string {
  if (!value) {
    throw new MemoryError("MEMORY_CONTEXT_INVALID", "Deletion scope is incomplete.");
  }
  return value;
}

function matchingDefinitions(
  definitions: readonly RetrievedMemoryContextContract[],
  question: string
): RetrievedMemoryContextContract[] {
  const normalizedQuestion = ` ${normalize(question)} `;
  return definitions.filter((item) => {
    const alias = item.definition?.alias;
    return alias ? normalizedQuestion.includes(` ${normalize(alias)} `) : false;
  });
}

function boundContext(
  contexts: readonly RetrievedMemoryContextContract[],
  policy: MemoryRetrievalPolicy
): RetrievedMemoryContextContract[] {
  const unique = new Map<string, RetrievedMemoryContextContract>();
  let characters = 0;
  for (const context of [...contexts].sort((left, right) => right.score - left.score)) {
    if (unique.has(context.sourceId)) continue;
    if (characters + context.content.length > policy.maxContextCharacters) continue;
    unique.set(context.sourceId, context);
    characters += context.content.length;
    if (unique.size >= policy.topK) break;
  }
  return [...unique.values()];
}

function normalize(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function safeFailureCode(error: unknown): string {
  if (error instanceof MemoryError) return error.code;
  return "MEMORY_INDEX_UNAVAILABLE";
}
