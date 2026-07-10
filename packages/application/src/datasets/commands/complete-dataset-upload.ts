import {
  uploadCompletionResponseSchema,
  type UploadCompletionResponse
} from "@agentic-csv/contracts";
import { DatasetId } from "@agentic-csv/domain";
import type { ObjectStorage, StoredObjectMetadata } from "../../ports/object-storage";
import type { UnitOfWork } from "../../ports/unit-of-work";
import { DatasetWorkflowError } from "../workflow-error";

const operation = "dataset.upload.complete.v1";

export interface CompleteDatasetUploadInput {
  readonly ownerId: string;
  readonly datasetId: string;
  readonly uploadIntentId: string;
  readonly idempotencyKey: string;
  readonly requestHash: string;
  readonly correlationId: string;
  readonly now?: Date;
}

export class CompleteDatasetUploadHandler {
  public constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly objectStorage: ObjectStorage
  ) {}

  public async execute(
    input: CompleteDatasetUploadInput
  ): Promise<UploadCompletionResponse> {
    const now = input.now ?? new Date();
    const existing = await this.unitOfWork.execute((transaction) =>
      transaction.idempotency.find({
        ownerId: input.ownerId,
        operation,
        key: input.idempotencyKey
      })
    );
    if (existing) {
      return resolveExistingIdempotency(existing, input.requestHash);
    }

    const intent = await this.unitOfWork.execute((transaction) =>
      transaction.uploadIntents.findByIdForOwner(input.uploadIntentId, input.ownerId)
    );
    if (!intent || intent.datasetId !== input.datasetId) {
      throw new DatasetWorkflowError(
        "UPLOAD_INTENT_NOT_FOUND",
        "Upload intent was not found."
      );
    }
    if (intent.expiresAt <= now) {
      throw new DatasetWorkflowError(
        "UPLOAD_INTENT_EXPIRED",
        "Upload intent has expired."
      );
    }

    const metadata = await this.objectStorage.inspectObject(intent.objectKey);
    assertObjectMatchesIntent(metadata, intent);

    return this.unitOfWork.execute(async (transaction) => {
      const reservation = await transaction.idempotency.reserve({
        ownerId: input.ownerId,
        operation,
        key: input.idempotencyKey,
        requestHash: input.requestHash,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000)
      });
      if (!reservation.acquired) {
        return resolveExistingIdempotency(reservation, input.requestHash);
      }

      const lockedIntent = await transaction.uploadIntents.findByIdForOwner(
        input.uploadIntentId,
        input.ownerId,
        { forUpdate: true }
      );
      const dataset = await transaction.datasets.findByIdForOwner(
        DatasetId.from(input.datasetId),
        input.ownerId,
        { forUpdate: true }
      );
      if (!lockedIntent || lockedIntent.datasetId !== input.datasetId || !dataset) {
        throw new DatasetWorkflowError("DATASET_NOT_FOUND", "Dataset was not found.");
      }
      if (lockedIntent.completedAt) {
        throw new DatasetWorkflowError(
          "DATASET_UPLOAD_STATE_INVALID",
          "Upload intent is already completed."
        );
      }

      dataset.markUploaded(lockedIntent.objectKey);
      const events = dataset.pullDomainEvents();
      await transaction.datasets.save(dataset);
      await transaction.events.publish(events);
      await transaction.uploadIntents.markCompleted(lockedIntent.id, now);
      await transaction.ingestionRequests.publish({
        schemaVersion: 1,
        jobName: "dataset.ingest.v1",
        correlationId: input.correlationId,
        ownerId: input.ownerId,
        datasetId: input.datasetId,
        objectKey: lockedIntent.objectKey,
        idempotencyKey: input.idempotencyKey
      });

      const response: UploadCompletionResponse = {
        datasetId: input.datasetId,
        status: "uploaded",
        ingestionRequested: true
      };
      await transaction.idempotency.complete({
        ownerId: input.ownerId,
        operation,
        key: input.idempotencyKey,
        response,
        completedAt: now
      });
      return response;
    });
  }
}

function resolveExistingIdempotency(
  reservation: {
    readonly requestHash: string;
    readonly response: unknown;
    readonly completed: boolean;
  },
  requestHash: string
): UploadCompletionResponse {
  if (reservation.requestHash !== requestHash) {
    throw new DatasetWorkflowError(
      "IDEMPOTENCY_KEY_REUSED",
      "Idempotency key was already used for a different request."
    );
  }
  if (!reservation.completed) {
    throw new DatasetWorkflowError(
      "IDEMPOTENCY_REQUEST_IN_PROGRESS",
      "A request with this idempotency key is still in progress."
    );
  }
  return uploadCompletionResponseSchema.parse(reservation.response);
}

function assertObjectMatchesIntent(
  metadata: StoredObjectMetadata,
  intent: {
    readonly ownerId: string;
    readonly datasetId: string;
    readonly contentType: string;
    readonly sizeBytes: number;
    readonly checksumSha256: string;
  }
): void {
  const matches =
    metadata.sizeBytes === intent.sizeBytes &&
    metadata.contentType?.toLowerCase() === intent.contentType.toLowerCase() &&
    metadata.checksumSha256 === intent.checksumSha256 &&
    metadata.ownerId === intent.ownerId &&
    metadata.datasetId === intent.datasetId;
  if (!matches) {
    throw new DatasetWorkflowError(
      "UPLOAD_OBJECT_METADATA_MISMATCH",
      "Uploaded object metadata does not match the upload intent."
    );
  }
}
