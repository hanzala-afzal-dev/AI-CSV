export type ConversationErrorCode =
  | "CONVERSATION_NOT_FOUND"
  | "CONVERSATION_ARCHIVED"
  | "CONVERSATION_CONFLICT"
  | "CONVERSATION_RUN_ACTIVE"
  | "CONVERSATION_RUN_NOT_FOUND"
  | "CONVERSATION_REQUEST_ID_REUSED"
  | "CONVERSATION_DATASET_NOT_FOUND";

export class ConversationError extends Error {
  public constructor(
    public readonly code: ConversationErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ConversationError";
  }
}
