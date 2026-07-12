import { describe, expect, it } from "vitest";
import { Argon2PasswordHasher } from "../src/auth/password-hasher";
import { HmacSecureTokenService } from "../src/auth/secure-token";

describe("identity cryptography", () => {
  it("hashes passwords with Argon2id and verifies without exposing plaintext", async () => {
    const hasher = new Argon2PasswordHasher({
      memoryCost: 19456,
      timeCost: 2,
      parallelism: 1
    });
    const hash = await hasher.hash("correct horse battery staple");
    expect(hash).toMatch(/^\$argon2id\$/);
    await expect(hasher.verify(hash, "correct horse battery staple")).resolves.toBe(true);
    await expect(hasher.verify(hash, "wrong password")).resolves.toBe(false);
  });

  it("scopes token hashes and rejects a replay after CSRF rotation", () => {
    const service = new HmacSecureTokenService("a".repeat(32));
    const first = service.issue("csrf:session-1");
    const second = service.issue("csrf:session-1");
    expect(service.matches("csrf:session-1", first.plaintext, first.hash)).toBe(true);
    expect(service.matches("csrf:session-1", first.plaintext, second.hash)).toBe(false);
    expect(service.hash("session", first.plaintext)).not.toBe(first.hash);
  });
});
