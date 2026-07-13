export type ProviderErrorCode =
  | "PROVIDER_CREDENTIAL_NOT_CONFIGURED"
  | "PROVIDER_KEY_INVALID"
  | "PROVIDER_RATE_LIMITED"
  | "PROVIDER_UNAVAILABLE"
  | "PROVIDER_MODEL_UNAVAILABLE"
  | "PROVIDER_REASONING_UNSUPPORTED";

export class ProviderError extends Error {
  public constructor(
    public readonly code: ProviderErrorCode,
    message: string
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
