import { describe, expect, it } from "vitest";
import { generateApiKey, hashApiKey } from "../src";

describe("API keys", () => {
  it("generates opaque keys and stores only a deterministic HMAC", () => {
    const generated = generateApiKey("a-development-secret-that-is-long-enough");

    expect(generated.plaintext).toMatch(/^csv_key_[A-Za-z0-9_-]{43}$/);
    expect(generated.keyHash).toMatch(/^[a-f0-9]{64}$/);
    expect(generated.keyHash).not.toContain(generated.plaintext);
    expect(
      hashApiKey(generated.plaintext, "a-development-secret-that-is-long-enough")
    ).toBe(generated.keyHash);
  });
});
