export type DomainErrorCode =
  | "DATASET_NAME_INVALID"
  | "DATASET_ID_INVALID"
  | "DATASET_STATUS_TRANSITION_INVALID"
  | "DATASET_PROFILE_STATS_INVALID"
  | "DATASET_FAILURE_REASON_REQUIRED"
  | "DATASET_OBJECT_KEY_REQUIRED"
  | "IDENTITY_EMAIL_INVALID"
  | "IDENTITY_DISPLAY_NAME_INVALID"
  | "PROVIDER_MODEL_ID_INVALID"
  | "PROVIDER_REASONING_EFFORT_INVALID"
  | "CONVERSATION_TITLE_INVALID"
  | "CONVERSATION_STATUS_TRANSITION_INVALID";

export class DomainError extends Error {
  public readonly code: DomainErrorCode;

  public constructor(code: DomainErrorCode, message: string) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}
