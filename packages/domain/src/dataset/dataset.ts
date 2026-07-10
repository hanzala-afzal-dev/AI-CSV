import { AggregateRoot } from "../shared/aggregate-root";
import { createDomainEvent } from "../shared/domain-event";
import { DomainError } from "../shared/domain-error";
import { DatasetId } from "./dataset-id";
import type { DatasetStatus } from "./dataset-status";

export interface DatasetProfileStats {
  readonly rowCount: number;
  readonly columnCount: number;
}

export interface DatasetProps {
  readonly id: DatasetId;
  readonly userId: string;
  readonly name: string;
  readonly originalFilename: string;
  readonly objectKey: string | null;
  readonly status: DatasetStatus;
  readonly rowCount: number | null;
  readonly columnCount: number | null;
  readonly failureReason: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class Dataset extends AggregateRoot {
  private constructor(private props: DatasetProps) {
    super();
  }

  public static create(input: {
    userId: string;
    name: string;
    originalFilename: string;
    id?: DatasetId;
  }): Dataset {
    const now = new Date();
    const dataset = new Dataset({
      id: input.id ?? DatasetId.create(),
      userId: requireNonBlank(input.userId, "User ID is required."),
      name: normalizeDatasetName(input.name),
      originalFilename: requireNonBlank(
        input.originalFilename,
        "Original filename is required."
      ),
      objectKey: null,
      status: "pending_upload",
      rowCount: null,
      columnCount: null,
      failureReason: null,
      createdAt: now,
      updatedAt: now
    });

    dataset.record(
      createDomainEvent({
        aggregateId: dataset.id.toString(),
        name: "dataset.created",
        payload: {
          userId: dataset.userId,
          name: dataset.name,
          originalFilename: dataset.originalFilename
        }
      })
    );

    return dataset;
  }

  public static rehydrate(props: DatasetProps): Dataset {
    return new Dataset({
      ...props,
      name: normalizeDatasetName(props.name),
      userId: requireNonBlank(props.userId, "User ID is required."),
      originalFilename: requireNonBlank(
        props.originalFilename,
        "Original filename is required."
      )
    });
  }

  public get id(): DatasetId {
    return this.props.id;
  }

  public get userId(): string {
    return this.props.userId;
  }

  public get name(): string {
    return this.props.name;
  }

  public get originalFilename(): string {
    return this.props.originalFilename;
  }

  public get objectKey(): string | null {
    return this.props.objectKey;
  }

  public get status(): DatasetStatus {
    return this.props.status;
  }

  public get rowCount(): number | null {
    return this.props.rowCount;
  }

  public get columnCount(): number | null {
    return this.props.columnCount;
  }

  public get failureReason(): string | null {
    return this.props.failureReason;
  }

  public markUploaded(objectKey: string): void {
    const normalizedObjectKey = requireNonBlank(
      objectKey,
      "Object key is required.",
      "DATASET_OBJECT_KEY_REQUIRED"
    );
    this.transitionTo("uploaded", ["pending_upload"]);
    this.props = {
      ...this.props,
      objectKey: normalizedObjectKey,
      updatedAt: new Date()
    };
    this.record(
      createDomainEvent({
        aggregateId: this.id.toString(),
        name: "dataset.uploaded",
        payload: { userId: this.userId, objectKey: this.props.objectKey }
      })
    );
  }

  public retryUpload(): void {
    this.transitionTo("pending_upload", ["failed"]);
    this.props = {
      ...this.props,
      objectKey: null,
      rowCount: null,
      columnCount: null,
      failureReason: null,
      updatedAt: new Date()
    };
    this.record(
      createDomainEvent({
        aggregateId: this.id.toString(),
        name: "dataset.upload_retried",
        payload: { userId: this.userId }
      })
    );
  }

  public startProfiling(): void {
    this.transitionTo("profiling", ["uploaded"]);
    this.record(
      createDomainEvent({
        aggregateId: this.id.toString(),
        name: "dataset.profiling_started",
        payload: { userId: this.userId }
      })
    );
  }

  public markReady(stats: DatasetProfileStats): void {
    assertValidStats(stats);
    this.transitionTo("ready", ["profiling"]);
    this.props = {
      ...this.props,
      rowCount: stats.rowCount,
      columnCount: stats.columnCount,
      failureReason: null,
      updatedAt: new Date()
    };
    this.record(
      createDomainEvent({
        aggregateId: this.id.toString(),
        name: "dataset.ready",
        payload: {
          userId: this.userId,
          rowCount: stats.rowCount,
          columnCount: stats.columnCount
        }
      })
    );
  }

  public markFailed(reason: string): void {
    const normalizedReason = requireNonBlank(
      reason,
      "Failure reason is required when marking a dataset failed.",
      "DATASET_FAILURE_REASON_REQUIRED"
    );
    if (this.status === "ready") {
      throw new DomainError(
        "DATASET_STATUS_TRANSITION_INVALID",
        "A ready dataset cannot transition to failed."
      );
    }
    this.transitionTo("failed", ["pending_upload", "uploaded", "profiling"]);
    this.props = {
      ...this.props,
      failureReason: normalizedReason,
      updatedAt: new Date()
    };
    this.record(
      createDomainEvent({
        aggregateId: this.id.toString(),
        name: "dataset.failed",
        payload: { userId: this.userId, reason: normalizedReason }
      })
    );
  }

  public toPrimitives(): DatasetProps {
    return { ...this.props };
  }

  private transitionTo(nextStatus: DatasetStatus, allowedFrom: DatasetStatus[]): void {
    if (!allowedFrom.includes(this.status)) {
      throw new DomainError(
        "DATASET_STATUS_TRANSITION_INVALID",
        `Cannot transition dataset from ${this.status} to ${nextStatus}.`
      );
    }

    this.props = { ...this.props, status: nextStatus, updatedAt: new Date() };
  }
}

function normalizeDatasetName(name: string): string {
  const normalized = name.trim();
  if (normalized.length < 1 || normalized.length > 120) {
    throw new DomainError(
      "DATASET_NAME_INVALID",
      "Dataset name must be between 1 and 120 characters."
    );
  }

  return normalized;
}

function requireNonBlank(
  value: string,
  message: string,
  code:
    | "DATASET_NAME_INVALID"
    | "DATASET_FAILURE_REASON_REQUIRED"
    | "DATASET_OBJECT_KEY_REQUIRED" = "DATASET_NAME_INVALID"
): string {
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new DomainError(code, message);
  }

  return normalized;
}

function assertValidStats(stats: DatasetProfileStats): void {
  const validRows = Number.isInteger(stats.rowCount) && stats.rowCount >= 0;
  const validColumns = Number.isInteger(stats.columnCount) && stats.columnCount > 0;

  if (!validRows || !validColumns) {
    throw new DomainError(
      "DATASET_PROFILE_STATS_INVALID",
      "Profile statistics must contain a non-negative row count and positive column count."
    );
  }
}
