import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type {
  MemoryIndexDocument,
  MemoryRepository,
  MemoryVectorHit
} from "@agentic-csv/application";
import {
  confirmedDatasetDefinitionSchema,
  memoryDocumentTypeSchema,
  type RetrievedMemoryContextContract
} from "@agentic-csv/contracts";
import {
  memoryContextHeads,
  memoryRecords,
  semanticDocuments
} from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class PostgresMemoryRepository implements MemoryRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public loadIndexDocuments(
    payload: Parameters<MemoryRepository["loadIndexDocuments"]>[0]
  ): Promise<readonly MemoryIndexDocument[]> {
    return this.executeForUser(payload.userId, async (transaction) => {
      if (payload.source === "confirmed-definition") {
        if (!payload.memoryId) return [];
        const rows = await transaction
          .select()
          .from(memoryRecords)
          .where(
            and(
              eq(memoryRecords.userId, payload.userId),
              eq(memoryRecords.datasetId, payload.datasetId),
              eq(memoryRecords.datasetVersionId, payload.datasetVersionId),
              eq(memoryRecords.id, payload.memoryId),
              isNull(memoryRecords.deletedAt),
              ne(memoryRecords.indexStatus, "deleting")
            )
          )
          .limit(1);
        return rows.map(mapMemoryRecord);
      }

      const rows = await transaction
        .select()
        .from(semanticDocuments)
        .where(
          and(
            eq(semanticDocuments.userId, payload.userId),
            eq(semanticDocuments.datasetId, payload.datasetId),
            eq(semanticDocuments.datasetVersionId, payload.datasetVersionId),
            ne(semanticDocuments.indexStatus, "deleting")
          )
        );
      return rows.map(mapSemanticDocument);
    });
  }

  public markIndexing(
    input: Parameters<MemoryRepository["markIndexing"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const groups = documentGroups(input.documents);
      if (groups.semantic.length > 0) {
        await transaction
          .update(semanticDocuments)
          .set({
            indexStatus: "indexing",
            failureCode: null,
            updatedAt: input.occurredAt
          })
          .where(
            and(
              eq(semanticDocuments.userId, input.userId),
              inArray(semanticDocuments.id, groups.semantic)
            )
          );
      }
      if (groups.memory.length > 0) {
        await transaction
          .update(memoryRecords)
          .set({
            indexStatus: "indexing",
            failureCode: null,
            updatedAt: input.occurredAt
          })
          .where(
            and(
              eq(memoryRecords.userId, input.userId),
              inArray(memoryRecords.id, groups.memory),
              isNull(memoryRecords.deletedAt)
            )
          );
      }
    });
  }

  public markIndexed(
    input: Parameters<MemoryRepository["markIndexed"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const groups = documentGroups(input.documents);
      if (groups.semantic.length > 0) {
        await transaction
          .update(semanticDocuments)
          .set({
            indexStatus: "indexed",
            embeddingModel: input.embeddingModel,
            failureCode: null,
            indexedAt: input.occurredAt,
            updatedAt: input.occurredAt
          })
          .where(
            and(
              eq(semanticDocuments.userId, input.userId),
              inArray(semanticDocuments.id, groups.semantic)
            )
          );
      }
      if (groups.memory.length > 0) {
        await transaction
          .update(memoryRecords)
          .set({
            indexStatus: "indexed",
            embeddingModel: input.embeddingModel,
            failureCode: null,
            indexedAt: input.occurredAt,
            updatedAt: input.occurredAt
          })
          .where(
            and(
              eq(memoryRecords.userId, input.userId),
              inArray(memoryRecords.id, groups.memory),
              isNull(memoryRecords.deletedAt)
            )
          );
      }
      await transaction
        .insert(memoryContextHeads)
        .values({
          userId: input.userId,
          datasetId: input.datasetId,
          datasetVersionId: input.datasetVersionId,
          revision: 1,
          updatedAt: input.occurredAt
        })
        .onConflictDoUpdate({
          target: [
            memoryContextHeads.userId,
            memoryContextHeads.datasetId,
            memoryContextHeads.datasetVersionId
          ],
          set: {
            revision: sql`${memoryContextHeads.revision} + 1`,
            updatedAt: input.occurredAt
          }
        });
    });
  }

  public markIndexFailed(
    input: Parameters<MemoryRepository["markIndexFailed"]>[0]
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const groups = documentGroups(input.documents);
      const failureCode = input.failureCode.slice(0, 80);
      if (groups.semantic.length > 0) {
        await transaction
          .update(semanticDocuments)
          .set({ indexStatus: "failed", failureCode, updatedAt: input.occurredAt })
          .where(
            and(
              eq(semanticDocuments.userId, input.userId),
              inArray(semanticDocuments.id, groups.semantic)
            )
          );
      }
      if (groups.memory.length > 0) {
        await transaction
          .update(memoryRecords)
          .set({ indexStatus: "failed", failureCode, updatedAt: input.occurredAt })
          .where(
            and(
              eq(memoryRecords.userId, input.userId),
              inArray(memoryRecords.id, groups.memory),
              isNull(memoryRecords.deletedAt)
            )
          );
      }
    });
  }

  public getRevision(
    input: Parameters<MemoryRepository["getRevision"]>[0]
  ): Promise<number> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [head] = await transaction
        .select({ revision: memoryContextHeads.revision })
        .from(memoryContextHeads)
        .where(
          and(
            eq(memoryContextHeads.userId, input.userId),
            eq(memoryContextHeads.datasetId, input.datasetId),
            eq(memoryContextHeads.datasetVersionId, input.datasetVersionId)
          )
        )
        .limit(1);
      return head?.revision ?? 0;
    });
  }

  public findConfirmedDefinitions(
    input: Parameters<MemoryRepository["findConfirmedDefinitions"]>[0]
  ): Promise<readonly RetrievedMemoryContextContract[]> {
    return this.executeForUser(input.userId, async (transaction) => {
      const rows = await transaction
        .select()
        .from(memoryRecords)
        .where(
          and(
            eq(memoryRecords.userId, input.userId),
            eq(memoryRecords.datasetId, input.datasetId),
            eq(memoryRecords.datasetVersionId, input.datasetVersionId),
            eq(memoryRecords.kind, "definition"),
            isNull(memoryRecords.deletedAt),
            ne(memoryRecords.indexStatus, "deleting")
          )
        )
        .limit(100);
      return rows.map((row) => memoryContext(row, 1));
    });
  }

  public hydrateVectorHits(
    input: Parameters<MemoryRepository["hydrateVectorHits"]>[0]
  ): Promise<readonly RetrievedMemoryContextContract[]> {
    return this.executeForUser(input.userId, async (transaction) => {
      const semanticHits = input.hits.filter(
        (hit) => hit.recordType === "semantic_document"
      );
      const memoryHits = input.hits.filter((hit) => hit.recordType === "memory_record");
      const contexts: RetrievedMemoryContextContract[] = [];

      if (semanticHits.length > 0) {
        const rows = await transaction
          .select()
          .from(semanticDocuments)
          .where(
            and(
              eq(semanticDocuments.userId, input.userId),
              eq(semanticDocuments.datasetId, input.datasetId),
              eq(semanticDocuments.datasetVersionId, input.datasetVersionId),
              eq(semanticDocuments.indexStatus, "indexed"),
              inArray(
                semanticDocuments.id,
                semanticHits.map((hit) => hit.recordId)
              )
            )
          );
        const scores = scoreMap(semanticHits);
        contexts.push(
          ...rows.map((row) => semanticContext(row, scores.get(row.id) ?? 0))
        );
      }
      if (memoryHits.length > 0) {
        const rows = await transaction
          .select()
          .from(memoryRecords)
          .where(
            and(
              eq(memoryRecords.userId, input.userId),
              eq(memoryRecords.datasetId, input.datasetId),
              eq(memoryRecords.datasetVersionId, input.datasetVersionId),
              eq(memoryRecords.indexStatus, "indexed"),
              isNull(memoryRecords.deletedAt),
              inArray(
                memoryRecords.id,
                memoryHits.map((hit) => hit.recordId)
              )
            )
          );
        const scores = scoreMap(memoryHits);
        contexts.push(...rows.map((row) => memoryContext(row, scores.get(row.id) ?? 0)));
      }
      return contexts;
    });
  }

  private executeForUser<TResult>(
    userId: string,
    work: (transaction: DatabaseTransaction) => Promise<TResult>
  ): Promise<TResult> {
    return this.database.transaction(async (transaction) => {
      await transaction.execute(
        sql`select set_config('app.current_user_id', ${userId}, true)`
      );
      return work(transaction);
    });
  }
}

function mapSemanticDocument(
  row: typeof semanticDocuments.$inferSelect
): MemoryIndexDocument {
  return {
    recordId: row.id,
    recordType: "semantic_document",
    pointId: row.vectorPointId,
    sourceId: row.sourceId,
    userId: row.userId,
    datasetId: row.datasetId,
    datasetVersionId: row.datasetVersionId,
    conversationId: null,
    documentType: memoryDocumentTypeSchema.parse(row.documentType),
    content: row.content,
    contentHash: row.contentHash,
    schemaVersion: 1,
    confidence: "verified",
    definition: null,
    indexStatus: indexStatus(row.indexStatus),
    indexedEmbeddingModel: row.embeddingModel
  };
}

function mapMemoryRecord(row: typeof memoryRecords.$inferSelect): MemoryIndexDocument {
  return {
    recordId: row.id,
    recordType: "memory_record",
    pointId: row.vectorPointId,
    sourceId: row.sourceMessageId,
    userId: row.userId,
    datasetId: row.datasetId,
    datasetVersionId: row.datasetVersionId,
    conversationId: row.conversationId,
    documentType: "business_rule",
    content: row.content,
    contentHash: row.contentHash,
    schemaVersion: 1,
    confidence: "confirmed",
    definition: confirmedDatasetDefinitionSchema.parse(row.definition),
    indexStatus: indexStatus(row.indexStatus),
    indexedEmbeddingModel: row.embeddingModel
  };
}

function semanticContext(
  row: typeof semanticDocuments.$inferSelect,
  score: number
): RetrievedMemoryContextContract {
  return {
    sourceId: row.sourceId,
    documentType: memoryDocumentTypeSchema.parse(row.documentType),
    content: row.content,
    score: boundedScore(score),
    confidence: "verified",
    datasetId: row.datasetId,
    datasetVersionId: row.datasetVersionId,
    definition: null
  };
}

function memoryContext(
  row: typeof memoryRecords.$inferSelect,
  score: number
): RetrievedMemoryContextContract {
  return {
    sourceId: row.sourceMessageId,
    documentType: "business_rule",
    content: row.content,
    score: boundedScore(score),
    confidence: "confirmed",
    datasetId: row.datasetId,
    datasetVersionId: row.datasetVersionId,
    definition: confirmedDatasetDefinitionSchema.parse(row.definition)
  };
}

function documentGroups(documents: readonly MemoryIndexDocument[]) {
  return {
    semantic: documents
      .filter((document) => document.recordType === "semantic_document")
      .map((document) => document.recordId),
    memory: documents
      .filter((document) => document.recordType === "memory_record")
      .map((document) => document.recordId)
  };
}

function indexStatus(value: string): MemoryIndexDocument["indexStatus"] {
  if (["pending", "indexing", "indexed", "failed"].includes(value)) {
    return value as MemoryIndexDocument["indexStatus"];
  }
  return "failed";
}

function scoreMap(hits: readonly MemoryVectorHit[]): Map<string, number> {
  return new Map(hits.map((hit) => [hit.recordId, hit.score]));
}

function boundedScore(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
}
