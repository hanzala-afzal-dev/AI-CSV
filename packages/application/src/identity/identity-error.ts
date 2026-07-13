export class IdentityError extends Error {
  public constructor(
    public readonly code:
      | "AUTHENTICATION_FAILED"
      | "AUTHENTICATION_REQUIRED"
      | "CURRENT_PASSWORD_INVALID"
      | "EMAIL_UNAVAILABLE"
      | "SESSION_NOT_FOUND"
      | "TOKEN_INVALID_OR_EXPIRED",
    message: string
  ) {
    super(message);
    this.name = "IdentityError";
  }
}
