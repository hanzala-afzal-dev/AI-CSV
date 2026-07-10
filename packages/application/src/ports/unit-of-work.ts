import type { DatasetRepository } from "./dataset-repository";
import type { EventPublisher } from "./event-publisher";

export interface DatasetUploadIntent {
  readonly id: string;
  readonly datasetId: string;
  readonly ownerId: string;
  readonly objectKey: string;
  readonly contentType: string;
  readonly sizeBytes: number;
  readonly checksumSha256: string;
  readonly expiresAt: Date;
  readonly completedAt: Date | null;
}

export interface UploadIntentRepository {
  create(intent: DatasetUploadIntent): Promise<void>;
  findByIdForOwner(
    id: string,
    ownerId: string,
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
    readonly ownerId: string;
    readonly operation: string;
    readonly key: string;
  }): Promise<IdempotencyReservation | null>;
  reserve(input: {
    readonly ownerId: string;
    readonly operation: string;
    readonly key: string;
    readonly requestHash: string;
    readonly expiresAt: Date;
  }): Promise<IdempotencyReservation>;
  complete(input: {
    readonly ownerId: string;
    readonly operation: string;
    readonly key: string;
    readonly response: unknown;
    readonly completedAt: Date;
  }): Promise<void>;
}

export interface IngestionRequestPublisher {
  publish(payload: {
    readonly schemaVersion: 1;
    readonly jobName: "dataset.ingest.v1";
    readonly correlationId: string;
    readonly ownerId: string;
    readonly datasetId: string;
    readonly objectKey: string;
    readonly idempotencyKey: string;
  }): Promise<void>;
}

export interface ApplicationTransaction {
  readonly datasets: DatasetRepository;
  readonly events: EventPublisher;
  readonly uploadIntents: UploadIntentRepository;
  readonly idempotency: IdempotencyRepository;
  readonly ingestionRequests: IngestionRequestPublisher;
}

export interface UnitOfWork {
  execute<TResult>(
    work: (transaction: ApplicationTransaction) => Promise<TResult>
  ): Promise<TResult>;
}
