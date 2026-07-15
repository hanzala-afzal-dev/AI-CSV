import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import { createUuidV7 } from "../shared/uuid-v7";

export const datasetVersionStatuses = [
  "pending_upload",
  "uploaded",
  "queued",
  "validating",
  "profiling",
  "indexing",
  "ready",
  "failed",
  "deleting",
  "deleted"
] as const;

export type DatasetVersionStatus = (typeof datasetVersionStatuses)[number];

export interface DatasetVersionProps {
  readonly id: string;
  readonly userId: string;
  readonly datasetId: string;
  readonly versionNumber: number;
  readonly status: DatasetVersionStatus;
  readonly failureCode: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class DatasetVersion extends AggregateRoot {
  private constructor(private props: DatasetVersionProps) {
    super();
  }

  public static create(input: {
    readonly userId: string;
    readonly datasetId: string;
    readonly versionNumber: number;
    readonly id?: string;
    readonly now?: Date;
  }): DatasetVersion {
    const now = input.now ?? new Date();
    return new DatasetVersion({
      id: requireIdentity(input.id ?? createUuidV7(now.getTime())),
      userId: requireIdentity(input.userId),
      datasetId: requireIdentity(input.datasetId),
      versionNumber: requireVersionNumber(input.versionNumber),
      status: "pending_upload",
      failureCode: null,
      createdAt: now,
      updatedAt: now
    });
  }

  public static rehydrate(props: DatasetVersionProps): DatasetVersion {
    if (!datasetVersionStatuses.includes(props.status)) {
      throw invalidTransition("Stored dataset version status is invalid.");
    }
    return new DatasetVersion({
      ...props,
      id: requireIdentity(props.id),
      userId: requireIdentity(props.userId),
      datasetId: requireIdentity(props.datasetId),
      versionNumber: requireVersionNumber(props.versionNumber)
    });
  }

  public get id(): string {
    return this.props.id;
  }

  public get status(): DatasetVersionStatus {
    return this.props.status;
  }

  public markUploaded(now = new Date()): void {
    this.transition("uploaded", ["pending_upload"], now);
  }

  public markQueued(now = new Date()): void {
    this.transition("queued", ["uploaded"], now);
  }

  public startValidation(now = new Date()): void {
    this.transition("validating", ["uploaded", "queued"], now);
  }

  public restartValidation(now = new Date()): void {
    this.transition("validating", ["validating", "profiling", "indexing"], now);
  }

  public startProfiling(now = new Date()): void {
    this.transition("profiling", ["validating"], now);
  }

  public startIndexing(now = new Date()): void {
    this.transition("indexing", ["profiling"], now);
  }

  public markReady(now = new Date()): void {
    this.transition("ready", ["indexing"], now);
  }

  public markFailed(failureCode: string, now = new Date()): void {
    const code = failureCode.trim();
    if (!/^[A-Z0-9_]{1,80}$/.test(code)) {
      throw invalidTransition("Dataset version failure code is invalid.");
    }
    this.transition(
      "failed",
      ["uploaded", "queued", "validating", "profiling", "indexing"],
      now
    );
    this.props = { ...this.props, failureCode: code };
  }

  public startDeleting(now = new Date()): void {
    this.transition(
      "deleting",
      [
        "pending_upload",
        "uploaded",
        "queued",
        "validating",
        "profiling",
        "indexing",
        "ready",
        "failed"
      ],
      now
    );
  }

  public markDeleted(now = new Date()): void {
    this.transition("deleted", ["deleting"], now);
  }

  public toPrimitives(): DatasetVersionProps {
    return { ...this.props };
  }

  private transition(
    next: DatasetVersionStatus,
    allowed: readonly DatasetVersionStatus[],
    now: Date
  ): void {
    if (this.status === next) return;
    if (!allowed.includes(this.status)) {
      throw invalidTransition(
        `Cannot transition dataset version from ${this.status} to ${next}.`
      );
    }
    this.props = {
      ...this.props,
      status: next,
      failureCode: next === "failed" ? this.props.failureCode : null,
      updatedAt: now
    };
  }
}

function requireIdentity(value: string): string {
  const normalized = value.trim();
  if (!normalized) throw invalidTransition("Dataset version identity is required.");
  return normalized;
}

function requireVersionNumber(value: number): number {
  if (!Number.isInteger(value) || value < 1) {
    throw invalidTransition("Dataset version number must be positive.");
  }
  return value;
}

function invalidTransition(message: string): DomainError {
  return new DomainError("DATASET_STATUS_TRANSITION_INVALID", message);
}
