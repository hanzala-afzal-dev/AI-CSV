export type DomainErrorCode =
  | "DATASET_NAME_INVALID"
  | "DATASET_ID_INVALID"
  | "DATASET_STATUS_TRANSITION_INVALID"
  | "DATASET_PROFILE_STATS_INVALID"
  | "DATASET_FAILURE_REASON_REQUIRED"
  | "DATASET_OBJECT_KEY_REQUIRED";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  public constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
