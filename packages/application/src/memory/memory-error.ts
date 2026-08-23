export type MemoryErrorCode =
  | "MEMORY_EMBEDDING_UNAVAILABLE"
  | "MEMORY_INDEX_UNAVAILABLE"
  | "MEMORY_RETRIEVAL_UNAVAILABLE"
  | "MEMORY_CONTEXT_INVALID";

export class MemoryError extends Error {
  public override readonly name = "MemoryError";

  public constructor(
    public readonly code: MemoryErrorCode,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
  }
}
