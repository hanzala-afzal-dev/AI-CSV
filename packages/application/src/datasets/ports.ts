import type {
  DatasetColumnProfileContract,
  DatasetFailureCodeContract,
  DatasetProfileContract,
  DatasetVersionStatusContract
} from "@agentic-csv/contracts";

export interface DatasetVersionView {
  readonly id: string;
  readonly versionNumber: number;
  readonly originalFilename: string;
  readonly mimeType: "text/csv" | "application/csv" | "text/plain";
  readonly sizeBytes: number;
  readonly status: DatasetVersionStatusContract;
  readonly failureCode: DatasetFailureCodeContract | null;
  readonly rowCount: number | null;
  readonly columnCount: number | null;
  readonly profileVersion: number | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DatasetView {
  readonly id: string;
  readonly name: string;
  readonly originalFilename: string;
  readonly status:
    "pending_upload" | "uploaded" | "profiling" | "ready" | "failed" | "deleting";
  readonly rowCount: number | null;
  readonly columnCount: number | null;
  readonly activeVersion: DatasetVersionView | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DatasetDetailView extends DatasetView {
  readonly versions: readonly DatasetVersionView[];
}

export interface DatasetProfileView {
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly profile: DatasetProfileContract;
}

export interface ConversationDatasetContext {
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly name: string;
  readonly originalFilename: string;
  readonly status: DatasetVersionStatusContract;
  readonly failureCode: DatasetFailureCodeContract | null;
  readonly rowCount: number | null;
  readonly columnCount: number | null;
  readonly columnNames: readonly string[];
  readonly suggestedPrompts: readonly string[];
}

export interface DatasetReadRepository {
  list(userId: string, limit: number): Promise<readonly DatasetView[]>;
  getDetail(userId: string, datasetId: string): Promise<DatasetDetailView | null>;
  getProfile(
    userId: string,
    datasetId: string,
    datasetVersionId: string
  ): Promise<DatasetProfileView | null>;
  getConversationContext(
    userId: string,
    conversationId: string
  ): Promise<ConversationDatasetContext | null>;
}

export interface DatasetIngestionWork {
  readonly userId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
}

export type DatasetIngestionClaim =
  | { readonly state: "claimed"; readonly work: DatasetIngestionWork }
  | { readonly state: "busy" | "terminal" };

export interface DatasetIngestionRepository {
  claim(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly claimId: string;
    readonly claimedAt: Date;
    readonly claimTtlSeconds: number;
  }): Promise<DatasetIngestionClaim>;
  markProfiling(input: IngestionMutationInput): Promise<void>;
  markIndexing(input: IngestionMutationInput): Promise<void>;
  complete(
    input: IngestionMutationInput & {
      readonly profile: DatasetProfileContract;
    }
  ): Promise<void>;
  fail(
    input: IngestionMutationInput & {
      readonly code: DatasetFailureCodeContract;
    }
  ): Promise<void>;
}

export interface IngestionMutationInput {
  readonly userId: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly claimId: string;
  readonly occurredAt: Date;
}

export interface CsvProfileInput {
  readonly content: AsyncIterable<Uint8Array>;
  readonly originalFilename: string;
  readonly declaredSizeBytes: number;
  readonly expectedChecksumSha256: string;
}

export interface CsvProfiler {
  profile(input: CsvProfileInput): Promise<DatasetProfileContract>;
}

export class DatasetFileValidationError extends Error {
  public constructor(
    public readonly code: DatasetFailureCodeContract,
    message: string
  ) {
    super(message);
    this.name = "DatasetFileValidationError";
  }
}

export function profileColumns(
  profile: DatasetProfileContract
): readonly DatasetColumnProfileContract[] {
  return profile.columns;
}
