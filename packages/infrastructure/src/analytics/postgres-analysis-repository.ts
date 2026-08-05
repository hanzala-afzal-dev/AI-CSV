import { and, eq, sql } from "drizzle-orm";
import type {
  AnalysisContextResult,
  AnalysisReadRepository,
  ReadyAnalysisContext
} from "@agentic-csv/application";
import {
  analysisArtifactBundleSchema,
  analysisProvenanceSchema,
  analysisResultRowSchema,
  chartFieldsMatchResult,
  chartSpecSchema,
  resultColumnSchema
} from "@agentic-csv/contracts";
import {
  agentRuns,
  analysisResults,
  chartArtifacts,
  conversations,
  datasetColumns,
  datasetVersions,
  datasets
} from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];

export class PostgresAnalysisRepository implements AnalysisReadRepository {
  public constructor(private readonly database: DatabaseClient) {}

  public loadRunContext(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly runId: string;
  }): Promise<AnalysisContextResult> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [run] = await transaction
        .select({
          activeDatasetId: conversations.activeDatasetId,
          activeDatasetVersionId: conversations.activeDatasetVersionId
        })
        .from(agentRuns)
        .innerJoin(
          conversations,
          and(
            eq(conversations.userId, agentRuns.userId),
            eq(conversations.id, agentRuns.conversationId)
          )
        )
        .where(
          and(
            eq(agentRuns.userId, input.userId),
            eq(agentRuns.conversationId, input.conversationId),
            eq(agentRuns.id, input.runId),
            eq(agentRuns.status, "running")
          )
        )
        .limit(1);
      if (!run?.activeDatasetId || !run.activeDatasetVersionId) {
        return { state: "no_dataset" };
      }

      const [version] = await transaction
        .select({
          datasetId: datasets.id,
          datasetName: datasets.name,
          datasetStatus: datasets.status,
          datasetVersionId: datasetVersions.id,
          versionStatus: datasetVersions.status,
          originalFilename: datasetVersions.originalFilename,
          objectKey: datasetVersions.objectKey,
          sizeBytes: datasetVersions.sizeBytes,
          checksumSha256: datasetVersions.checksum,
          delimiter: datasetVersions.delimiter
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
            eq(datasetVersions.userId, input.userId),
            eq(datasetVersions.datasetId, run.activeDatasetId),
            eq(datasetVersions.id, run.activeDatasetVersionId)
          )
        )
        .limit(1);
      if (!version) return { state: "no_dataset" };
      if (
        version.datasetStatus !== "ready" ||
        version.versionStatus !== "ready" ||
        !isDelimiter(version.delimiter)
      ) {
        return {
          state: "not_ready",
          originalFilename: version.originalFilename,
          status: version.versionStatus
        };
      }

      const columns = await transaction
        .select({
          id: datasetColumns.id,
          originalName: datasetColumns.originalName,
          canonicalName: datasetColumns.canonicalName,
          inferredType: datasetColumns.inferredType,
          semanticType: datasetColumns.semanticType,
          nullable: datasetColumns.nullable
        })
        .from(datasetColumns)
        .where(
          and(
            eq(datasetColumns.userId, input.userId),
            eq(datasetColumns.datasetId, version.datasetId),
            eq(datasetColumns.datasetVersionId, version.datasetVersionId)
          )
        )
        .orderBy(datasetColumns.ordinal);
      if (columns.length === 0) {
        return {
          state: "not_ready",
          originalFilename: version.originalFilename,
          status: "profiling"
        };
      }
      const context: ReadyAnalysisContext = {
        userId: input.userId,
        conversationId: input.conversationId,
        runId: input.runId,
        datasetId: version.datasetId,
        datasetVersionId: version.datasetVersionId,
        datasetName: version.datasetName,
        originalFilename: version.originalFilename,
        objectKey: version.objectKey,
        sizeBytes: version.sizeBytes,
        checksumSha256: version.checksumSha256,
        delimiter: version.delimiter,
        columns: columns.map((column) => ({
          ...column,
          inferredType: parseInferredType(column.inferredType),
          semanticType: parseSemanticType(column.semanticType)
        }))
      };
      return { state: "ready", context };
    });
  }

  public getArtifact(userId: string, resultId: string) {
    return this.executeForUser(userId, async (transaction) => {
      const [row] = await transaction
        .select({ result: analysisResults, chart: chartArtifacts })
        .from(analysisResults)
        .innerJoin(
          chartArtifacts,
          and(
            eq(chartArtifacts.userId, analysisResults.userId),
            eq(chartArtifacts.resultArtifactId, analysisResults.id)
          )
        )
        .where(and(eq(analysisResults.userId, userId), eq(analysisResults.id, resultId)))
        .limit(1);
      if (!row) return null;
      const artifact = analysisArtifactBundleSchema.parse({
        messageId: row.chart.messageId,
        result: {
          id: row.result.id,
          planId: row.result.planId,
          runId: row.result.runId,
          datasetId: row.result.datasetId,
          datasetVersionId: row.result.datasetVersionId,
          planHash: row.result.planHash,
          schema: arrayOf(row.result.resultSchema, resultColumnSchema),
          rows: arrayOf(row.result.rows, analysisResultRowSchema),
          rowCount: row.result.rowCount,
          truncated: row.result.truncated,
          executionMs: row.result.executionMs,
          checksum: row.result.checksum,
          provenance: analysisProvenanceSchema.parse(row.result.provenance),
          createdAt: row.result.createdAt.toISOString()
        },
        chart: {
          id: row.chart.id,
          resultArtifactId: row.chart.resultArtifactId,
          spec: chartSpecSchema.parse(row.chart.chartSpec),
          createdAt: row.chart.createdAt.toISOString()
        }
      });
      if (!chartFieldsMatchResult(artifact.chart.spec, artifact.result)) {
        throw new Error("Stored chart fields do not match the analysis result schema.");
      }
      return artifact;
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

function arrayOf<TValue>(
  value: unknown,
  schema: { parse(input: unknown): TValue }
): TValue[] {
  if (!Array.isArray(value)) throw new Error("Stored analysis array is invalid.");
  return value.map((item) => schema.parse(item));
}

function isDelimiter(value: string | null): value is ReadyAnalysisContext["delimiter"] {
  return value === "," || value === ";" || value === "\t" || value === "|";
}

function parseInferredType(
  value: string
): ReadyAnalysisContext["columns"][number]["inferredType"] {
  if (["integer", "decimal", "boolean", "date", "timestamp", "text"].includes(value)) {
    return value as ReadyAnalysisContext["columns"][number]["inferredType"];
  }
  throw new Error("Stored analysis column type is invalid.");
}

function parseSemanticType(
  value: string
): ReadyAnalysisContext["columns"][number]["semanticType"] {
  if (["identifier", "numeric", "date", "categorical", "free_text"].includes(value)) {
    return value as ReadyAnalysisContext["columns"][number]["semanticType"];
  }
  throw new Error("Stored analysis semantic type is invalid.");
}
