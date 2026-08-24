import { and, desc, eq, sql } from "drizzle-orm";
import type { SuggestionRepository } from "@agentic-csv/application";
import {
  analysisPlanSchema,
  conversationMessageContentSchema,
  datasetColumnSemanticTypeSchema,
  datasetColumnStatisticsSchema,
  datasetColumnTypeSchema,
  resultColumnSchema
} from "@agentic-csv/contracts";
import {
  agentRuns,
  analysisPlans,
  analysisResults,
  conversationMessages,
  conversations,
  datasetColumns,
  datasetVersions,
  datasets
} from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class PostgresSuggestionRepository implements SuggestionRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public loadContext(
    userId: string,
    conversationId: string
  ): ReturnType<SuggestionRepository["loadContext"]> {
    return this.executeForUser(userId, async (transaction) => {
      const [conversation] = await transaction
        .select({
          datasetId: conversations.activeDatasetId,
          datasetVersionId: conversations.activeDatasetVersionId
        })
        .from(conversations)
        .where(
          and(eq(conversations.userId, userId), eq(conversations.id, conversationId))
        )
        .limit(1);
      if (!conversation) return { state: "conversation_not_found" };
      if (!conversation.datasetId || !conversation.datasetVersionId) {
        return { state: "no_dataset" };
      }

      const [version] = await transaction
        .select({
          datasetId: datasets.id,
          datasetStatus: datasets.status,
          datasetVersionId: datasetVersions.id,
          versionStatus: datasetVersions.status
        })
        .from(datasetVersions)
        .innerJoin(
          datasets,
          and(
            eq(datasets.userId, datasetVersions.userId),
            eq(datasets.id, datasetVersions.datasetId)
          )
        )
        .where(
          and(
            eq(datasetVersions.userId, userId),
            eq(datasetVersions.datasetId, conversation.datasetId),
            eq(datasetVersions.id, conversation.datasetVersionId)
          )
        )
        .limit(1);
      if (
        !version ||
        version.datasetStatus !== "ready" ||
        version.versionStatus !== "ready"
      ) {
        return {
          state: "not_ready",
          datasetVersionId: conversation.datasetVersionId
        };
      }

      const rows = await transaction
        .select({
          id: datasetColumns.id,
          originalName: datasetColumns.originalName,
          canonicalName: datasetColumns.canonicalName,
          inferredType: datasetColumns.inferredType,
          semanticType: datasetColumns.semanticType,
          nullable: datasetColumns.nullable,
          statistics: datasetColumns.statistics
        })
        .from(datasetColumns)
        .where(
          and(
            eq(datasetColumns.userId, userId),
            eq(datasetColumns.datasetId, version.datasetId),
            eq(datasetColumns.datasetVersionId, version.datasetVersionId)
          )
        )
        .orderBy(datasetColumns.ordinal);
      if (rows.length === 0) {
        return { state: "not_ready", datasetVersionId: version.datasetVersionId };
      }

      const [latest] = await transaction
        .select({
          resultId: analysisResults.id,
          questionContent: conversationMessages.contentParts,
          plan: analysisPlans.plan,
          resultSchema: analysisResults.resultSchema,
          rowCount: analysisResults.rowCount
        })
        .from(analysisResults)
        .innerJoin(
          analysisPlans,
          and(
            eq(analysisPlans.userId, analysisResults.userId),
            eq(analysisPlans.runId, analysisResults.runId),
            eq(analysisPlans.id, analysisResults.planId)
          )
        )
        .innerJoin(
          agentRuns,
          and(
            eq(agentRuns.userId, analysisResults.userId),
            eq(agentRuns.conversationId, analysisResults.conversationId),
            eq(agentRuns.id, analysisResults.runId)
          )
        )
        .innerJoin(
          conversationMessages,
          and(
            eq(conversationMessages.userId, agentRuns.userId),
            eq(conversationMessages.conversationId, agentRuns.conversationId),
            eq(conversationMessages.id, agentRuns.userMessageId)
          )
        )
        .where(
          and(
            eq(analysisResults.userId, userId),
            eq(analysisResults.conversationId, conversationId),
            eq(analysisResults.datasetId, version.datasetId),
            eq(analysisResults.datasetVersionId, version.datasetVersionId),
            eq(agentRuns.status, "completed")
          )
        )
        .orderBy(desc(analysisResults.createdAt))
        .limit(1);

      return {
        state: "ready",
        datasetId: version.datasetId,
        datasetVersionId: version.datasetVersionId,
        columns: rows.map((row) => {
          const statistics = datasetColumnStatisticsSchema.parse(row.statistics);
          return {
            id: row.id,
            originalName: row.originalName,
            canonicalName: row.canonicalName,
            inferredType: datasetColumnTypeSchema.parse(row.inferredType),
            semanticType: datasetColumnSemanticTypeSchema.parse(row.semanticType),
            nullable: row.nullable,
            nullCount: statistics.nullCount,
            distinctCount: statistics.distinctCount
          };
        }),
        latestAnalysis: latest
          ? {
              resultId: latest.resultId,
              question: messageText(latest.questionContent),
              plan: analysisPlanSchema.parse(latest.plan),
              resultSchema: arrayOf(latest.resultSchema, resultColumnSchema),
              rowCount: latest.rowCount
            }
          : null
      };
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

function messageText(value: unknown): string {
  const content = conversationMessageContentSchema.parse(value);
  return content.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function arrayOf<TValue>(
  value: unknown,
  schema: { parse(input: unknown): TValue }
): TValue[] {
  if (!Array.isArray(value)) throw new Error("Stored suggestion context is invalid.");
  return value.map((item) => schema.parse(item));
}
