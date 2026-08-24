export type PrivacyDeletionErrorCode = "DATASET_NOT_FOUND" | "DELETION_NOT_FOUND";

export class PrivacyDeletionError extends Error {
  public constructor(
    public readonly code: PrivacyDeletionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PrivacyDeletionError";
  }
}
