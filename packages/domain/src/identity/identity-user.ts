import { randomUUID } from "node:crypto";
import { AggregateRoot } from "../shared/aggregate-root";
import { DomainError } from "../shared/domain-error";
import { EmailAddress } from "./email-address";

export type IdentityUserStatus = "pending_verification" | "active" | "disabled";

export interface IdentityUserProps {
  readonly id: string;
  readonly email: EmailAddress;
  readonly displayName: string;
  readonly status: IdentityUserStatus;
  readonly emailVerifiedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class IdentityUser extends AggregateRoot {
  private constructor(private props: IdentityUserProps) {
    super();
  }

  public static register(input: {
    readonly email: string;
    readonly displayName: string;
    readonly now: Date;
    readonly id?: string;
  }): IdentityUser {
    return new IdentityUser({
      id: input.id ?? randomUUID(),
      email: EmailAddress.create(input.email),
      displayName: normalizeDisplayName(input.displayName),
      status: "pending_verification",
      emailVerifiedAt: null,
      createdAt: input.now,
      updatedAt: input.now
    });
  }

  public static rehydrate(props: IdentityUserProps): IdentityUser {
    return new IdentityUser({
      ...props,
      displayName: normalizeDisplayName(props.displayName)
    });
  }

  public rename(displayName: string, now: Date): void {
    this.props = {
      ...this.props,
      displayName: normalizeDisplayName(displayName),
      updatedAt: now
    };
  }

  public verifyEmail(now: Date): void {
    this.props = {
      ...this.props,
      status: "active",
      emailVerifiedAt: now,
      updatedAt: now
    };
  }

  public toPrimitives(): IdentityUserProps {
    return { ...this.props };
  }
}

function normalizeDisplayName(value: string): string {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 160) {
    throw new DomainError(
      "IDENTITY_DISPLAY_NAME_INVALID",
      "Display name must contain 2 to 160 characters."
    );
  }
  return normalized;
}
