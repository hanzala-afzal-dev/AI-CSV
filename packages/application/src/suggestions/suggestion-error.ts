export type SuggestionErrorCode = "CONVERSATION_NOT_FOUND";

export class SuggestionError extends Error {
  public constructor(
    public readonly code: SuggestionErrorCode,
    message: string
  ) {
    super(message);
    this.name = "SuggestionError";
  }
}
