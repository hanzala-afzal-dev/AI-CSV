import type { DatasetRepository } from "./dataset-repository";
import type { EventPublisher } from "./event-publisher";

export interface DatasetUploadIntent {
  readonly id: string;
  readonly datasetId: string;
  readonly datasetVersionId: string;
  readonly userId: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly expiresAt: Date;
  readonly completedAt: Date | null;
}

export interface PendingDatasetVersion {
  readonly id: string;
  readonly userId: string;
  readonly datasetId: string;
  readonly versionNumber: number;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly objectKey: string;
  readonly sizeBytes: number;
  readonly checksum: string;
}

export interface DatasetVersionRepository {
  nextVersionNumber(datasetId: string): Promise<number>;
  createPending(version: PendingDatasetVersion): Promise<void>;
  markUploaded(id: string, userId: string, uploadedAt: Date): Promise<void>;
}

export interface UploadIntentRepository {
  create(intent: DatasetUploadIntent): Promise<void>;
  findByIdForUser(
    id: string,
    userId: string,
    options?: { readonly forUpdate?: boolean }
  ): Promise<DatasetUploadIntent | null>;
  markCompleted(id: string, completedAt: Date): Promise<void>;
}

export interface IdempotencyReservation {
  readonly acquired: boolean;
  readonly requestHash: string;
  readonly response: unknown;
  readonly completed: boolean;
}

export interface IdempotencyRepository {
  find(input: {
    readonly userId: string;
    readonly operation: string;
    readonly key: string;
  }): Promise<IdempotencyReservation | null>;
  reserve(input: {
    readonly userId: string;
    readonly operation: string;
    readonly key: string;
    readonly requestHash: string;
    readonly expiresAt: Date;
  }): Promise<IdempotencyReservation>;
  complete(input: {
    readonly userId: string;
    readonly operation: string;
    readonly key: string;
    readonly response: unknown;
    readonly completedAt: Date;
  }): Promise<void>;
}

export interface IngestionRequestPublisher {
  publish(payload: {
    readonly version: 1;
    readonly jobName: "dataset.ingest.v1";
    readonly correlationId: string;
    readonly userId: string;
    readonly datasetId: string;
    readonly datasetVersionId: string;
    readonly objectKey: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
}

export interface ApplicationTransaction {
  readonly datasets: DatasetRepository;
  readonly datasetVersions: DatasetVersionRepository;
  readonly events: EventPublisher;
  readonly uploadIntents: UploadIntentRepository;
  readonly idempotency: IdempotencyRepository;
  readonly ingestionRequests: IngestionRequestPublisher;
}

export interface UnitOfWork {
  executeForUser<TResult>(
    userId: string,
    work: (transaction: ApplicationTransaction) => Promise<TResult>
  ): Promise<TResult>;
}
