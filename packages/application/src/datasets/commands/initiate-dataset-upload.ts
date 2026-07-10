import { DatasetId } from "@agentic-csv/domain";
import type { ObjectStorage } from "../../ports/object-storage";
import type { UnitOfWork } from "../../ports/unit-of-work";
import { DatasetWorkflowError } from "../workflow-error";

export interface InitiateDatasetUploadInput {
  readonly userId: string;
  readonly datasetId: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
}

export interface InitiateDatasetUploadResult {
  readonly uploadIntentId: string;
  readonly datasetVersionId: string;
  readonly objectKey: string;
  readonly uploadUrl: string;
  readonly method: "PUT";
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

export class InitiateDatasetUploadHandler {
  public constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly objectStorage: ObjectStorage,
    private readonly maxUploadBytes: number,
    private readonly presignedUrlTtlSeconds: number
  ) {}

  public async execute(
    input: InitiateDatasetUploadInput
  ): Promise<InitiateDatasetUploadResult> {
    if (input.sizeBytes > this.maxUploadBytes) {
      throw new DatasetWorkflowError(
        "UPLOAD_TOO_LARGE",
        `Upload exceeds the ${this.maxUploadBytes} byte limit.`
      );
    }

    const datasetId = DatasetId.from(input.datasetId);
    const dataset = await this.unitOfWork.executeForUser(input.userId, (transaction) =>
      transaction.datasets.findByIdForUser(datasetId, input.userId)
    );
    if (!dataset) {
      throw new DatasetWorkflowError("DATASET_NOT_FOUND", "Dataset was not found.");
    }
    assertUploadCanStart(dataset.status);

    const uploadIntentId = crypto.randomUUID();
    const datasetVersionId = crypto.randomUUID();
    const presignedUpload = await this.objectStorage.createPresignedUpload({
      userId: input.userId,
      datasetId: input.datasetId,
      datasetVersionId,
      uploadIntentId,
      filename: dataset.originalFilename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      checksumSha256: input.checksumSha256,
      expiresInSeconds: this.presignedUrlTtlSeconds
    });

    await this.unitOfWork.executeForUser(input.userId, async (transaction) => {
      const lockedDataset = await transaction.datasets.findByIdForUser(
        datasetId,
        input.userId,
        { forUpdate: true }
      );
      if (!lockedDataset) {
        throw new DatasetWorkflowError("DATASET_NOT_FOUND", "Dataset was not found.");
      }
      assertUploadCanStart(lockedDataset.status);

      if (lockedDataset.status === "failed") {
        lockedDataset.retryUpload();
        await transaction.datasets.save(lockedDataset);
        await transaction.events.publish(lockedDataset.pullDomainEvents());
      }

      const versionNumber = await transaction.datasetVersions.nextVersionNumber(
        input.datasetId
      );
      await transaction.datasetVersions.createPending({
        id: datasetVersionId,
        userId: input.userId,
        datasetId: input.datasetId,
        versionNumber,
        originalFilename: lockedDataset.originalFilename,
        mimeType: input.contentType,
        objectKey: presignedUpload.objectKey,
        sizeBytes: input.sizeBytes,
        checksum: input.checksumSha256
      });

      await transaction.uploadIntents.create({
        id: uploadIntentId,
        datasetId: input.datasetId,
        datasetVersionId,
        userId: input.userId,
        objectKey: presignedUpload.objectKey,
        contentType: input.contentType,
        sizeBytes: input.sizeBytes,
        checksumSha256: input.checksumSha256,
        expiresAt: presignedUpload.expiresAt,
        completedAt: null
      });
    });

    return {
      uploadIntentId,
      datasetVersionId,
      objectKey: presignedUpload.objectKey,
      uploadUrl: presignedUpload.uploadUrl,
      method: "PUT",
      requiredHeaders: presignedUpload.requiredHeaders,
      expiresAt: presignedUpload.expiresAt
    };
  }
}

function assertUploadCanStart(status: string): void {
  if (status !== "pending_upload" && status !== "failed") {
    throw new DatasetWorkflowError(
      "DATASET_UPLOAD_STATE_INVALID",
      `Cannot initiate an upload while the dataset is ${status}.`
    );
  }
}
