import type { DatasetIngestionJobPayload } from "@agentic-csv/contracts";
import type { ObjectStorage } from "../ports/object-storage";
import {
  DatasetFileValidationError,
  type CsvProfiler,
  type DatasetIngestionRepository
} from "./ports";

export class DatasetIngestionService {
  public constructor(
    private readonly repository: DatasetIngestionRepository,
    private readonly objectStorage: ObjectStorage,
    private readonly profiler: CsvProfiler,
    private readonly claimTtlSeconds: number,
    private readonly now: () => Date = () => new Date()
  ) {}

  public async process(
    payload: DatasetIngestionJobPayload,
    claimId: string
  ): Promise<"completed" | "busy" | "terminal" | "failed_validation"> {
    const claim = await this.repository.claim({
      userId: payload.userId,
      datasetId: payload.datasetId,
      datasetVersionId: payload.datasetVersionId,
      claimId,
      claimedAt: this.now(),
      claimTtlSeconds: this.claimTtlSeconds
    });
    if (claim.state !== "claimed") return claim.state;

    const work = claim.work;
    if (work.objectKey !== payload.objectKey) {
      await this.fail(work, claimId, "DATASET_JOB_CONTEXT_INVALID");
      return "failed_validation";
    }

    try {
      const metadata = await this.objectStorage.inspectObject(work.objectKey);
      if (
        metadata.sizeBytes !== work.sizeBytes ||
        metadata.checksumSha256 !== work.checksumSha256 ||
        metadata.contentType?.toLowerCase() !== work.mimeType.toLowerCase()
      ) {
        await this.fail(work, claimId, "DATASET_OBJECT_METADATA_MISMATCH");
        return "failed_validation";
      }

      await this.repository.markProfiling(mutationInput(work, claimId, this.now()));
      const content = await this.objectStorage.readObject(work.objectKey);
      const profile = await this.profiler.profile({
        content,
        originalFilename: work.originalFilename,
        declaredSizeBytes: work.sizeBytes,
        expectedChecksumSha256: work.checksumSha256
      });
      await this.repository.markIndexing(mutationInput(work, claimId, this.now()));
      await this.repository.complete({
        ...mutationInput(work, claimId, this.now()),
        profile
      });
      return "completed";
    } catch (error) {
      if (error instanceof DatasetFileValidationError) {
        await this.fail(work, claimId, error.code);
        return "failed_validation";
      }
      throw error;
    }
  }

  public failAfterRetries(
    payload: DatasetIngestionJobPayload,
    claimId: string
  ): Promise<void> {
    return this.repository.fail({
      userId: payload.userId,
      datasetId: payload.datasetId,
      datasetVersionId: payload.datasetVersionId,
      claimId,
      occurredAt: this.now(),
      code: "DATASET_PROCESSING_FAILED"
    });
  }

  private fail(
    work: {
      readonly userId: string;
      readonly datasetId: string;
      readonly datasetVersionId: string;
    },
    claimId: string,
    code: Parameters<DatasetIngestionRepository["fail"]>[0]["code"]
  ) {
    return this.repository.fail({
      ...mutationInput(work, claimId, this.now()),
      code
    });
  }
}

function mutationInput(
  work: {
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
  },
  claimId: string,
  occurredAt: Date
) {
  return {
    userId: work.userId,
    datasetId: work.datasetId,
    datasetVersionId: work.datasetVersionId,
    claimId,
    occurredAt
  };
}
