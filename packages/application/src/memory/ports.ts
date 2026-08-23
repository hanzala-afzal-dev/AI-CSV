import type {
  ConfirmedDatasetDefinitionContract,
  KnowledgeIndexJobPayload,
  MemoryConfidenceContract,
  MemoryDocumentTypeContract,
  MemoryRetrievalResultContract,
  RetrievedMemoryContextContract
} from "@agentic-csv/contracts";

export interface MemoryRetrievalInput {
  readonly userId: string;
  readonly conversationId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly question: string;
}

export interface SemanticMemoryRetriever {
  retrieve(input: MemoryRetrievalInput): Promise<MemoryRetrievalResultContract>;
}

export interface MemoryIndexDocument {
  readonly recordId: string;
  readonly recordType: "semantic_document" | "memory_record";
  readonly pointId: string;
  readonly sourceId: string;
  readonly userId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly conversationId: string | null;
  readonly documentType: MemoryDocumentTypeContract;
  readonly content: string;
  readonly contentHash: string;
  readonly schemaVersion: 1;
  readonly confidence: MemoryConfidenceContract | null;
  readonly definition: ConfirmedDatasetDefinitionContract | null;
  readonly indexStatus: "pending" | "indexing" | "indexed" | "failed";
  readonly indexedEmbeddingModel: string | null;
}

export interface MemoryVectorPoint {
  readonly id: string;
  readonly vector: readonly number[];
  readonly payload: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly conversationId: string | null;
    readonly documentType: MemoryDocumentTypeContract;
    readonly recordType: "semantic_document" | "memory_record";
    readonly recordId: string;
    readonly sourceId: string;
    readonly contentHash: string;
    readonly schemaVersion: 1;
    readonly embeddingModel: string;
    readonly status: "active";
  };
}

export interface MemoryVectorHit {
  readonly recordType: "semantic_document" | "memory_record";
  readonly recordId: string;
  readonly score: number;
}

export interface MemoryRepository {
  loadIndexDocuments(
    payload: KnowledgeIndexJobPayload
  ): Promise<readonly MemoryIndexDocument[]>;
  markIndexing(input: {
    readonly userId: string;
    readonly documents: readonly MemoryIndexDocument[];
    readonly occurredAt: Date;
  }): Promise<void>;
  markIndexed(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly documents: readonly MemoryIndexDocument[];
    readonly embeddingModel: string;
    readonly occurredAt: Date;
  }): Promise<void>;
  markIndexFailed(input: {
    readonly userId: string;
    readonly documents: readonly MemoryIndexDocument[];
    readonly failureCode: string;
    readonly occurredAt: Date;
  }): Promise<void>;
  getRevision(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  }): Promise<number>;
  findConfirmedDefinitions(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  }): Promise<readonly RetrievedMemoryContextContract[]>;
  hydrateVectorHits(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly hits: readonly MemoryVectorHit[];
  }): Promise<readonly RetrievedMemoryContextContract[]>;
}

export interface UserTextEmbeddingProvider {
  readonly modelId: string;
  embed(
    userId: string,
    texts: readonly string[]
  ): Promise<readonly (readonly number[])[]>;
}

export interface SemanticVectorStore {
  ensureReady(): Promise<void>;
  upsert(points: readonly MemoryVectorPoint[]): Promise<void>;
  search(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly vector: readonly number[];
    readonly limit: number;
    readonly scoreThreshold: number;
  }): Promise<readonly MemoryVectorHit[]>;
  delete(input: {
    readonly userId: string;
    readonly conversationId?: string;
    readonly datasetId?: string;
  }): Promise<void>;
}

export interface MemoryRetrievalCache {
  get(
    input: MemoryRetrievalInput & { readonly revision: number }
  ): Promise<MemoryRetrievalResultContract | null>;
  set(
    input: MemoryRetrievalInput & { readonly revision: number },
    value: MemoryRetrievalResultContract
  ): Promise<void>;
}
