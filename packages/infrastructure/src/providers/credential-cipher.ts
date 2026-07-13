import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import type {
  CredentialCipher,
  CredentialEncryptionContext,
  EncryptedSecretMaterial,
  SecretValue
} from "@agentic-csv/application";
import { SecretValue as ApplicationSecretValue } from "@agentic-csv/application";

export interface CredentialCipherConfig {
  readonly currentKey: string;
  readonly currentKeyVersion: string;
  readonly previousKeys?: string;
}

export class AesGcmCredentialCipher implements CredentialCipher {
  private readonly keys: ReadonlyMap<string, Buffer>;
  private readonly currentKey: Buffer;

  public constructor(private readonly config: CredentialCipherConfig) {
    this.currentKey = decodeKey(config.currentKey, "APP_ENCRYPTION_KEY");
    const keys = new Map<string, Buffer>([[config.currentKeyVersion, this.currentKey]]);
    for (const [version, encoded] of Object.entries(
      parsePreviousKeys(config.previousKeys)
    )) {
      if (keys.has(version)) {
        throw new Error("Encryption key versions must be unique.");
      }
      keys.set(version, decodeKey(encoded, `previous key ${version}`));
    }
    this.keys = keys;
  }

  public encrypt(
    secret: SecretValue,
    context: CredentialEncryptionContext
  ): EncryptedSecretMaterial {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.currentKey, nonce, {
      authTagLength: 16
    });
    cipher.setAAD(associatedData(context));
    const encrypted = secret.use((value) => {
      const plaintext = Buffer.from(value, "utf8");
      try {
        return Buffer.concat([cipher.update(plaintext), cipher.final()]);
      } finally {
        plaintext.fill(0);
      }
    });
    const fingerprint = secret.use((value) =>
      createHmac("sha256", this.currentKey)
        .update("provider-credential-fingerprint:v1\0", "utf8")
        .update(value, "utf8")
        .digest("hex")
    );
    return {
      ciphertext: encrypted.toString("base64"),
      nonce: nonce.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
      algorithm: "AES-256-GCM",
      keyVersion: this.config.currentKeyVersion,
      fingerprint
    };
  }

  public decrypt(
    encrypted: EncryptedSecretMaterial,
    context: CredentialEncryptionContext
  ): SecretValue {
    try {
      if (encrypted.algorithm !== "AES-256-GCM") {
        throw new Error("Unsupported credential encryption algorithm.");
      }
      const key = this.keys.get(encrypted.keyVersion);
      if (!key) {
        throw new Error("Credential encryption key version is unavailable.");
      }
      const nonce = decodeBase64(encrypted.nonce, 12, "nonce");
      const authTag = decodeBase64(encrypted.authTag, 16, "authentication tag");
      const ciphertext = decodeBase64(encrypted.ciphertext, undefined, "ciphertext");
      if (ciphertext.length === 0 || ciphertext.length > 2048) {
        throw new Error("Encrypted credential length is invalid.");
      }
      const decipher = createDecipheriv("aes-256-gcm", key, nonce, {
        authTagLength: 16
      });
      decipher.setAAD(associatedData(context));
      decipher.setAuthTag(authTag);
      const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      try {
        return ApplicationSecretValue.create(plaintext.toString("utf8"));
      } finally {
        plaintext.fill(0);
      }
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message === "Credential encryption key version is unavailable." ||
          error.message === "Unsupported credential encryption algorithm.")
      ) {
        throw error;
      }
      throw new Error("Provider credential could not be decrypted.", { cause: error });
    }
  }
}

function associatedData(context: CredentialEncryptionContext): Buffer {
  return Buffer.from(
    [
      "provider-credential:v1",
      context.userId,
      context.provider,
      context.credentialId
    ].join("\0"),
    "utf8"
  );
}

function decodeKey(value: string, name: string): Buffer {
  const key = decodeBase64(value, 32, name);
  if (key.toString("base64") !== value) {
    throw new Error(`${name} must use canonical base64 encoding.`);
  }
  return key;
}

function decodeBase64(value: string, expectedLength: number | undefined, name: string) {
  const decoded = Buffer.from(value, "base64");
  if (decoded.toString("base64") !== value) {
    throw new Error(`${name} is not canonical base64.`);
  }
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw new Error(`${name} has an invalid length.`);
  }
  return decoded;
}

function parsePreviousKeys(value: string | undefined): Record<string, string> {
  if (!value) return {};
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("APP_ENCRYPTION_PREVIOUS_KEYS must be a JSON object.");
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([version, key]) => {
      if (!/^[A-Za-z0-9._-]{1,64}$/.test(version) || typeof key !== "string") {
        throw new Error("Previous encryption key entry is invalid.");
      }
      return [version, key];
    })
  );
}
