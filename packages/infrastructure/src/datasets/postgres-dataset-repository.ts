import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type {
  ConversationDatasetContext,
  DatasetDetailView,
  DatasetIngestionClaim,
  DatasetIngestionRepository,
  DatasetProfileView,
  DatasetReadRepository,
  DatasetVersionView,
  DatasetView,
  IngestionMutationInput
} from "@agentic-csv/application";
import {
  datasetColumnProfileSchema,
  datasetProfileSchema,
  type DatasetColumnProfileContract,
  type DatasetProfileContract
} from "@agentic-csv/contracts";
import { DatasetVersion, type DatasetVersionStatus } from "@agentic-csv/domain";
import {
  conversations,
  datasetColumns,
  datasetProfiles,
  datasetVersions,
  datasets
} from "../../drizzle/schema";
import type { DatabaseClient } from "../database/client";

type DatabaseTransaction = Parameters<Parameters<DatabaseClient["transaction"]>[0]>[0];
type DatabaseExecutor = DatabaseClient | DatabaseTransaction;
type DatasetRow = typeof datasets.$inferSelect;
type VersionRow = typeof datasetVersions.$inferSelect;

const processingStatuses = ["validating", "profiling", "indexing"] as const;
const terminalStatuses = ["ready", "failed", "deleting", "deleted"] as const;

export class PostgresDatasetRepository
  implements DatasetReadRepository, DatasetIngestionRepository
{
  public constructor(private readonly database: DatabaseClient) {}

  public list(userId: string, limit: number): Promise<readonly DatasetView[]> {
    return this.executeForUser(userId, async (transaction) => {
      const rows = await transaction
        .select({ dataset: datasets, version: datasetVersions })
        .from(datasets)
        .leftJoin(
          datasetVersions,
          and(
            eq(datasetVersions.userId, datasets.userId),
            eq(datasetVersions.datasetId, datasets.id),
            eq(datasetVersions.id, datasets.activeVersionId)
          )
        )
        .where(
          and(eq(datasets.userId, userId), inArray(datasets.status, visibleStatuses))
        )
        .orderBy(desc(datasets.updatedAt), desc(datasets.id))
        .limit(limit);
      return rows.map(({ dataset, version }) => mapDataset(dataset, version));
    });
  }

  public getDetail(userId: string, datasetId: string): Promise<DatasetDetailView | null> {
    return this.executeForUser(userId, async (transaction) => {
      const [dataset] = await transaction
        .select()
        .from(datasets)
        .where(and(eq(datasets.userId, userId), eq(datasets.id, datasetId)))
        .limit(1);
      if (!dataset) return null;
      const versions = await transaction
        .select()
        .from(datasetVersions)
        .where(
          and(
            eq(datasetVersions.userId, userId),
            eq(datasetVersions.datasetId, datasetId)
          )
        )
        .orderBy(desc(datasetVersions.versionNumber))
        .limit(50);
      const activeVersion = versions.find(
        (version) => version.id === dataset.activeVersionId
      );
      return {
        ...mapDataset(dataset, activeVersion ?? null),
        versions: versions.map(mapVersion)
      };
    });
  }

  public getProfile(
    userId: string,
    datasetId: string,
    datasetVersionId: string
  ): Promise<DatasetProfileView | null> {
    return this.executeForUser(userId, async (transaction) => {
      const [stored] = await transaction
        .select()
        .from(datasetProfiles)
        .where(
          and(
            eq(datasetProfiles.userId, userId),
            eq(datasetProfiles.datasetId, datasetId),
            eq(datasetProfiles.datasetVersionId, datasetVersionId)
          )
        )
        .limit(1);
      if (!stored) return null;
      const columns = await transaction
        .select()
        .from(datasetColumns)
        .where(
          and(
            eq(datasetColumns.userId, userId),
            eq(datasetColumns.datasetId, datasetId),
            eq(datasetColumns.datasetVersionId, datasetVersionId)
          )
        )
        .orderBy(datasetColumns.ordinal);
      const parsed = datasetProfileSchema.parse(stored.profile);
      const persistedColumns = columns.map(mapColumn);
      return {
        datasetId,
        datasetVersionId,
        profile: datasetProfileSchema.parse({ ...parsed, columns: persistedColumns })
      };
    });
  }

  public getConversationContext(
    userId: string,
    conversationId: string
  ): Promise<ConversationDatasetContext | null> {
    return this.executeForUser(userId, async (transaction) => {
      const [row] = await transaction
        .select({
          datasetId: datasets.id,
          datasetVersionId: datasetVersions.id,
          name: datasets.name,
          originalFilename: datasetVersions.originalFilename,
          status: datasetVersions.status,
          failureCode: datasetVersions.failureCode,
          rowCount: datasetVersions.rowCount,
          columnCount: datasetVersions.columnCount,
          profile: datasetProfiles.profile
        })
        .from(conversations)
        .innerJoin(
          datasets,
          and(
            eq(datasets.userId, conversations.userId),
            eq(datasets.id, conversations.activeDatasetId)
          )
        )
        .innerJoin(
          datasetVersions,
          and(
            eq(datasetVersions.userId, conversations.userId),
            eq(datasetVersions.datasetId, conversations.activeDatasetId),
            eq(datasetVersions.id, conversations.activeDatasetVersionId)
          )
        )
        .leftJoin(
          datasetProfiles,
          and(
            eq(datasetProfiles.userId, conversations.userId),
            eq(datasetProfiles.datasetVersionId, conversations.activeDatasetVersionId)
          )
        )
        .where(
          and(eq(conversations.userId, userId), eq(conversations.id, conversationId))
        )
        .limit(1);
      if (!row) return null;
      const profile = row.profile ? datasetProfileSchema.parse(row.profile) : null;
      return {
        datasetId: row.datasetId,
        datasetVersionId: row.datasetVersionId,
        name: row.name,
        originalFilename: row.originalFilename,
        status: row.status,
        failureCode: parseFailureCode(row.failureCode),
        rowCount: row.rowCount,
        columnCount: row.columnCount,
        columnNames: profile?.columns.map((column) => column.originalName) ?? [],
        suggestedPrompts: profile?.suggestedPrompts ?? []
      };
    });
  }

  public claim(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly claimId: string;
    readonly claimedAt: Date;
    readonly claimTtlSeconds: number;
  }): Promise<DatasetIngestionClaim> {
    return this.executeForUser(input.userId, async (transaction) => {
      const [row] = await transaction
        .select({ version: datasetVersions })
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
            eq(datasetVersions.datasetId, input.datasetId),
            eq(datasetVersions.id, input.datasetVersionId)
          )
        )
        .limit(1)
        .for("update");
      if (!row || terminalStatuses.includes(row.version.status as never)) {
        return { state: "terminal" };
      }

      const staleBefore = new Date(
        input.claimedAt.getTime() - input.claimTtlSeconds * 1000
      );
      const resumable =
        processingStatuses.includes(row.version.status as never) &&
        (row.version.ingestionClaimId === input.claimId ||
          row.version.ingestionClaimedAt === null ||
          row.version.ingestionClaimedAt < staleBefore);
      if (processingStatuses.includes(row.version.status as never) && !resumable) {
        return { state: "busy" };
      }
      if (
        !resumable &&
        row.version.status !== "queued" &&
        row.version.status !== "uploaded"
      ) {
        return { state: "terminal" };
      }

      const version = rehydrateVersion(row.version);
      if (resumable) version.restartValidation(input.claimedAt);
      else version.startValidation(input.claimedAt);

      await transaction
        .update(datasetVersions)
        .set({
          status: version.status,
          ingestionClaimId: input.claimId,
          ingestionClaimedAt: input.claimedAt,
          ingestionAttempt: sql`${datasetVersions.ingestionAttempt} + 1`,
          failureCode: null,
          updatedAt: input.claimedAt
        })
        .where(
          and(
            eq(datasetVersions.userId, input.userId),
            eq(datasetVersions.id, input.datasetVersionId)
          )
        );
      return {
        state: "claimed",
        work: {
          userId: row.version.userId,
          datasetId: row.version.datasetId,
          datasetVersionId: row.version.id,
          originalFilename: row.version.originalFilename,
          mimeType: row.version.mimeType,
          objectKey: row.version.objectKey,
          sizeBytes: row.version.sizeBytes,
          checksumSha256: row.version.checksum
        }
      };
    });
  }

  public markProfiling(input: IngestionMutationInput): Promise<void> {
    return this.updateProcessingState(
      input,
      "validating",
      "profiling",
      async (transaction) => {
        await transaction
          .update(datasets)
          .set({ status: "profiling", failureReason: null, updatedAt: input.occurredAt })
          .where(
            and(eq(datasets.userId, input.userId), eq(datasets.id, input.datasetId))
          );
      }
    );
  }

  public markIndexing(input: IngestionMutationInput): Promise<void> {
    return this.updateProcessingState(input, "profiling", "indexing");
  }

  public complete(
    input: IngestionMutationInput & { readonly profile: DatasetProfileContract }
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const version = await requireClaim(transaction, input, ["indexing"]);
      version.markReady(input.occurredAt);
      await transaction
        .delete(datasetColumns)
        .where(
          and(
            eq(datasetColumns.userId, input.userId),
            eq(datasetColumns.datasetVersionId, input.datasetVersionId)
          )
        );
      await transaction
        .delete(datasetProfiles)
        .where(
          and(
            eq(datasetProfiles.userId, input.userId),
            eq(datasetProfiles.datasetVersionId, input.datasetVersionId)
          )
        );
      await transaction.insert(datasetColumns).values(
        input.profile.columns.map((column) => ({
          userId: input.userId,
          datasetId: input.datasetId,
          datasetVersionId: input.datasetVersionId,
          ordinal: column.ordinal,
          originalName: column.originalName,
          canonicalName: column.canonicalName,
          inferredType: column.inferredType,
          semanticType: column.semanticType,
          nullable: column.nullable,
          statistics: column.statistics
        }))
      );
      await transaction.insert(datasetProfiles).values({
        userId: input.userId,
        datasetId: input.datasetId,
        datasetVersionId: input.datasetVersionId,
        profile: input.profile,
        warnings: input.profile.warnings,
        suggestedPrompts: input.profile.suggestedPrompts,
        generatedAt: new Date(input.profile.generatedAt)
      });
      await transaction
        .update(datasetVersions)
        .set({
          status: version.status,
          encoding: input.profile.encoding,
          delimiter: input.profile.delimiter,
          rowCount: input.profile.rowCount,
          columnCount: input.profile.columnCount,
          profileVersion: input.profile.version,
          schemaProfile: { version: 1, columns: input.profile.columns },
          statisticalProfile: {
            version: 1,
            warnings: input.profile.warnings,
            suggestedPrompts: input.profile.suggestedPrompts
          },
          failureCode: null,
          ingestionClaimId: null,
          ingestionClaimedAt: null,
          updatedAt: input.occurredAt
        })
        .where(
          and(
            eq(datasetVersions.userId, input.userId),
            eq(datasetVersions.id, input.datasetVersionId),
            eq(datasetVersions.ingestionClaimId, input.claimId)
          )
        );
      await transaction
        .update(datasets)
        .set({
          status: "ready",
          activeVersionId: input.datasetVersionId,
          rowCount: input.profile.rowCount,
          columnCount: input.profile.columnCount,
          failureReason: null,
          updatedAt: input.occurredAt
        })
        .where(and(eq(datasets.userId, input.userId), eq(datasets.id, input.datasetId)));
    });
  }

  public fail(
    input: IngestionMutationInput & {
      readonly code: Parameters<DatasetIngestionRepository["fail"]>[0]["code"];
    }
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const version = await requireClaim(transaction, input, processingStatuses);
      const previousStatus = version.status;
      version.markFailed(input.code, input.occurredAt);
      const versionProps = version.toPrimitives();
      const [failed] = await transaction
        .update(datasetVersions)
        .set({
          status: version.status,
          failureCode: versionProps.failureCode,
          ingestionClaimId: null,
          ingestionClaimedAt: null,
          updatedAt: input.occurredAt
        })
        .where(
          and(
            eq(datasetVersions.userId, input.userId),
            eq(datasetVersions.datasetId, input.datasetId),
            eq(datasetVersions.id, input.datasetVersionId),
            eq(datasetVersions.ingestionClaimId, input.claimId),
            eq(datasetVersions.status, previousStatus)
          )
        )
        .returning({ id: datasetVersions.id });
      if (!failed) throw new Error("Dataset ingestion claim is no longer active.");
      await transaction
        .update(datasets)
        .set({
          status: "failed",
          failureReason: input.code,
          updatedAt: input.occurredAt
        })
        .where(and(eq(datasets.userId, input.userId), eq(datasets.id, input.datasetId)));
    });
  }

  private updateProcessingState(
    input: IngestionMutationInput,
    expectedStatus: "validating" | "profiling",
    status: "profiling" | "indexing",
    after?: (transaction: DatabaseTransaction) => Promise<void>
  ): Promise<void> {
    return this.executeForUser(input.userId, async (transaction) => {
      const version = await requireClaim(transaction, input, [expectedStatus]);
      if (status === "profiling") version.startProfiling(input.occurredAt);
      else version.startIndexing(input.occurredAt);
      const [updated] = await transaction
        .update(datasetVersions)
        .set({
          status: version.status,
          ingestionClaimedAt: input.occurredAt,
          updatedAt: input.occurredAt
        })
        .where(
          and(
            eq(datasetVersions.userId, input.userId),
            eq(datasetVersions.datasetId, input.datasetId),
            eq(datasetVersions.id, input.datasetVersionId),
            eq(datasetVersions.ingestionClaimId, input.claimId),
            eq(datasetVersions.status, expectedStatus)
          )
        )
        .returning({ id: datasetVersions.id });
      if (!updated) throw new Error("Dataset ingestion claim is no longer active.");
      await after?.(transaction);
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

const visibleStatuses = [
  "pending_upload",
  "uploaded",
  "profiling",
  "ready",
  "failed",
  "deleting"
] as const;

function mapDataset(dataset: DatasetRow, version: VersionRow | null): DatasetView {
  return {
    id: dataset.id,
    name: dataset.name,
    originalFilename: dataset.originalFilename,
    status: dataset.status,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    activeVersion: version ? mapVersion(version) : null,
    createdAt: dataset.createdAt,
    updatedAt: dataset.updatedAt
  };
}

function mapVersion(version: VersionRow): DatasetVersionView {
  if (!isSupportedMimeType(version.mimeType)) {
    throw new Error("Stored dataset MIME type is invalid.");
  }
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    originalFilename: version.originalFilename,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    status: version.status,
    failureCode: parseFailureCode(version.failureCode),
    rowCount: version.rowCount,
    columnCount: version.columnCount,
    profileVersion: version.profileVersion,
    createdAt: version.createdAt,
    updatedAt: version.updatedAt
  };
}

function mapColumn(
  row: typeof datasetColumns.$inferSelect
): DatasetColumnProfileContract {
  return datasetColumnProfileSchema.parse({
    ordinal: row.ordinal,
    originalName: row.originalName,
    canonicalName: row.canonicalName,
    inferredType: row.inferredType,
    semanticType: row.semanticType,
    nullable: row.nullable,
    statistics: row.statistics
  });
}

async function requireClaim(
  transaction: DatabaseExecutor,
  input: IngestionMutationInput,
  statuses: readonly DatasetVersionStatus[]
): Promise<DatasetVersion> {
  const [row] = await transaction
    .select()
    .from(datasetVersions)
    .where(
      and(
        eq(datasetVersions.userId, input.userId),
        eq(datasetVersions.datasetId, input.datasetId),
        eq(datasetVersions.id, input.datasetVersionId),
        eq(datasetVersions.ingestionClaimId, input.claimId),
        inArray(datasetVersions.status, statuses)
      )
    )
    .limit(1)
    .for("update");
  if (!row) throw new Error("Dataset ingestion claim is no longer active.");
  return rehydrateVersion(row);
}

function rehydrateVersion(row: VersionRow): DatasetVersion {
  return DatasetVersion.rehydrate({
    id: row.id,
    userId: row.userId,
    datasetId: row.datasetId,
    versionNumber: row.versionNumber,
    status: row.status,
    failureCode: row.failureCode,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  });
}

function isSupportedMimeType(
  value: string
): value is "text/csv" | "application/csv" | "text/plain" {
  return value === "text/csv" || value === "application/csv" || value === "text/plain";
}

function parseFailureCode(value: string | null) {
  if (!value) return null;
  const parsed = datasetFailureCodeValues.find((candidate) => candidate === value);
  if (!parsed) throw new Error("Stored dataset failure code is invalid.");
  return parsed;
}

const datasetFailureCodeValues = [
  "DATASET_INVALID_FILE",
  "DATASET_ENCODING_UNSUPPORTED",
  "DATASET_MALFORMED_CSV",
  "DATASET_EMPTY_FILE",
  "DATASET_ROW_LIMIT_EXCEEDED",
  "DATASET_COLUMN_LIMIT_EXCEEDED",
  "DATASET_FIELD_LIMIT_EXCEEDED",
  "DATASET_ROW_WIDTH_LIMIT_EXCEEDED",
  "DATASET_PROFILE_TIMEOUT",
  "DATASET_PROCESSING_FAILED",
  "DATASET_OBJECT_METADATA_MISMATCH",
  "DATASET_CHECKSUM_MISMATCH",
  "DATASET_JOB_CONTEXT_INVALID"
] as const;
