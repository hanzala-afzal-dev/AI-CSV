import { describe, expect, it } from "vitest";
import { SecretValue } from "@agentic-csv/application";
import { AesGcmCredentialCipher } from "../src/providers";

const userId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";
const context = { credentialId, userId, provider: "openai" as const };
const keyV1 = Buffer.alloc(32, 1).toString("base64");
const keyV2 = Buffer.alloc(32, 2).toString("base64");

describe("AesGcmCredentialCipher", () => {
  it("round-trips with unique nonces and does not place plaintext in material", () => {
    const cipher = new AesGcmCredentialCipher({
      currentKey: keyV1,
      currentKeyVersion: "v1"
    });
    const secret = SecretValue.create("sk-test-abcdefghijklmnopqrstuvwxyz123456");
    const first = cipher.encrypt(secret, context);
    const second = cipher.encrypt(secret, context);

    expect(first.algorithm).toBe("AES-256-GCM");
    expect(first.keyVersion).toBe("v1");
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.ciphertext).not.toContain("sk-test");
    const decrypted = cipher.decrypt(first, context);
    expect(decrypted.use((value) => value)).toBe(
      "sk-test-abcdefghijklmnopqrstuvwxyz123456"
    );
    decrypted.destroy();
    secret.destroy();
  });

  it("rejects tampering and associated-data substitution", () => {
    const cipher = new AesGcmCredentialCipher({
      currentKey: keyV1,
      currentKeyVersion: "v1"
    });
    const secret = SecretValue.create("sk-test-abcdefghijklmnopqrstuvwxyz123456");
    const encrypted = cipher.encrypt(secret, context);

    expect(() =>
      cipher.decrypt(
        { ...encrypted, authTag: Buffer.alloc(16).toString("base64") },
        context
      )
    ).toThrow("could not be decrypted");
    expect(() =>
      cipher.decrypt(encrypted, {
        ...context,
        userId: "33333333-3333-4333-8333-333333333333"
      })
    ).toThrow("could not be decrypted");
    secret.destroy();
  });

  it("decrypts an old key version during rotation", () => {
    const oldCipher = new AesGcmCredentialCipher({
      currentKey: keyV1,
      currentKeyVersion: "v1"
    });
    const secret = SecretValue.create("sk-test-abcdefghijklmnopqrstuvwxyz123456");
    const encrypted = oldCipher.encrypt(secret, context);
    const rotatedCipher = new AesGcmCredentialCipher({
      currentKey: keyV2,
      currentKeyVersion: "v2",
      previousKeys: JSON.stringify({ v1: keyV1 })
    });

    expect(rotatedCipher.decrypt(encrypted, context).use((value) => value)).toBe(
      "sk-test-abcdefghijklmnopqrstuvwxyz123456"
    );
    secret.destroy();
  });
});
