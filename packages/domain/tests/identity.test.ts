import { describe, expect, it } from "vitest";
import { EmailAddress, IdentityUser } from "../src";

describe("identity domain", () => {
  it("normalizes email addresses before identity comparison", () => {
    expect(EmailAddress.create("  Alice@Example.COM ").toString()).toBe(
      "alice@example.com"
    );
  });

  it("normalizes display names and starts registrations unverified", () => {
    const now = new Date("2026-07-12T10:00:00Z");
    const user = IdentityUser.register({
      email: "alice@example.com",
      displayName: "  Alice   Analyst ",
      now
    });
    expect(user.toPrimitives()).toMatchObject({
      displayName: "Alice Analyst",
      status: "pending_verification",
      emailVerifiedAt: null
    });
    user.verifyEmail(now);
    expect(user.toPrimitives()).toMatchObject({ status: "active", emailVerifiedAt: now });
  });

  it("rejects malformed email and display-name input", () => {
    expect(() => EmailAddress.create("not-an-email")).toThrow("Email address is invalid");
    expect(() =>
      IdentityUser.register({ email: "a@example.com", displayName: "x", now: new Date() })
    ).toThrow("Display name must contain");
  });
});
