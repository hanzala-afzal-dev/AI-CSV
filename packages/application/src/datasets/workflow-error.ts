export type DatasetWorkflowErrorCode =
  | "DATASET_NOT_FOUND"
  | "DATASET_UPLOAD_STATE_INVALID"
  | "UPLOAD_TOO_LARGE"
  | "UPLOAD_INTENT_NOT_FOUND"
  | "UPLOAD_INTENT_EXPIRED"
  | "UPLOAD_OBJECT_METADATA_MISMATCH"
  | "IDEMPOTENCY_KEY_REUSED"
  | "IDEMPOTENCY_REQUEST_IN_PROGRESS";

export class DatasetWorkflowError extends Error {
  public constructor(
    public readonly code: DatasetWorkflowErrorCode,
    message: string
  ) {
    super(message);
    this.name = "DatasetWorkflowError";
  }
}
