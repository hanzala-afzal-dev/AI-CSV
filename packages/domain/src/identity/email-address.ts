import { DomainError } from "../shared/domain-error";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class EmailAddress {
  private constructor(private readonly value: string) {}

  public static create(input: string): EmailAddress {
    const normalized = input.trim().normalize("NFKC").toLowerCase();
    if (normalized.length > 320 || !emailPattern.test(normalized)) {
      throw new DomainError("IDENTITY_EMAIL_INVALID", "Email address is invalid.");
    }
    return new EmailAddress(normalized);
  }

  public toString(): string {
    return this.value;
  }

  public equals(other: EmailAddress): boolean {
    return this.value === other.value;
  }
}
