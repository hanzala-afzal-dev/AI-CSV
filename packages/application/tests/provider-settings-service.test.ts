import { describe, expect, it, vi } from "vitest";
import {
  ProviderError,
  ProviderSettingsService,
  SecretValue,
  type AiProviderGateway,
  type CredentialCipher,
  type ProviderSettingsRepository,
  type ProviderSettingsSnapshot,
  type StoredEncryptedCredential
} from "../src";

const userId = "11111111-1111-4111-8111-111111111111";
const credentialId = "22222222-2222-4222-8222-222222222222";
const now = new Date("2026-07-13T12:00:00.000Z");
const apiKey = "sk-test-abcdefghijklmnopqrstuvwxyz123456";

describe("ProviderSettingsService", () => {
  it("validates before encrypting and persists only encrypted material and safe metadata", async () => {
    const repository = repositoryPort();
    const gateway = gatewayPort();
    const cipher = cipherPort();
    const service = createService(repository, cipher, gateway);

    const result = await service.saveCredential({
      userId,
      apiKey,
      correlationId: "33333333-3333-4333-8333-333333333333"
    });

    expect(gateway.validateCredential).toHaveBeenCalledBefore(vi.mocked(cipher.encrypt));
    expect(repository.replaceCredential).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId,
        last4: "3456",
        encrypted: expect.objectContaining({ ciphertext: "ciphertext" }),
        preference: expect.objectContaining({
          modelId: "gpt-5.5",
          reasoningEffort: "medium"
        })
      })
    );
    expect(JSON.stringify(result)).not.toContain(apiKey);
    expect(result.settings.credential.last4).toBe("3456");
  });

  it("leaves an existing credential untouched when replacement validation fails", async () => {
    const repository = repositoryPort(configuredSnapshot());
    const gateway = gatewayPort();
    gateway.validateCredential = vi.fn(async () => {
      throw new ProviderError("PROVIDER_KEY_INVALID", "The OpenAI API key is invalid.");
    });
    const service = createService(repository, cipherPort(), gateway);

    await expect(
      service.saveCredential({
        userId,
        apiKey: "sk-invalid-abcdefghijklmnopqrstuvwxyz",
        correlationId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_KEY_INVALID" });

    expect(repository.replaceCredential).not.toHaveBeenCalled();
    expect(repository.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "provider.credential.validation_failed",
        outcome: "failure",
        metadata: expect.objectContaining({ code: "PROVIDER_KEY_INVALID" })
      })
    );
  });

  it("marks a saved credential invalid after an authentication failure", async () => {
    const repository = repositoryPort(configuredSnapshot());
    const gateway = gatewayPort();
    gateway.validateCredential = vi.fn(async () => {
      throw new ProviderError("PROVIDER_KEY_INVALID", "The OpenAI API key is invalid.");
    });
    const service = createService(repository, cipherPort(), gateway);

    await expect(
      service.revalidateCredential({
        userId,
        correlationId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_KEY_INVALID" });

    expect(repository.updateValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        credentialId,
        status: "invalid",
        validatedAt: null,
        failureCode: "PROVIDER_KEY_INVALID",
        operation: "credential_revalidate"
      })
    );
  });

  it("preserves credential status on a transient revalidation failure", async () => {
    const repository = repositoryPort(configuredSnapshot());
    const gateway = gatewayPort();
    gateway.validateCredential = vi.fn(async () => {
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        "OpenAI credential validation is temporarily unavailable."
      );
    });
    const service = createService(repository, cipherPort(), gateway);

    await expect(
      service.revalidateCredential({
        userId,
        correlationId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });

    expect(repository.updateValidation).not.toHaveBeenCalled();
    expect(repository.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "provider.credential.validation_failed",
        metadata: {
          operation: "credential_revalidate",
          code: "PROVIDER_UNAVAILABLE"
        }
      })
    );
  });

  it("audits model-catalog failures without mutating credential state", async () => {
    const repository = repositoryPort(configuredSnapshot());
    const gateway = gatewayPort();
    gateway.listCompatibleModels = vi.fn(async () => {
      throw new ProviderError(
        "PROVIDER_RATE_LIMITED",
        "OpenAI temporarily rate-limited credential validation."
      );
    });
    const service = createService(repository, cipherPort(), gateway);

    await expect(
      service.listModels({
        userId,
        correlationId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_RATE_LIMITED" });

    expect(repository.updateValidation).not.toHaveBeenCalled();
    expect(repository.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: {
          operation: "model_catalog",
          code: "PROVIDER_RATE_LIMITED"
        }
      })
    );
  });

  it("marks the credential invalid when preference validation loses access", async () => {
    const repository = repositoryPort(configuredSnapshot());
    const gateway = gatewayPort();
    gateway.listCompatibleModels = vi.fn(async () => {
      throw new ProviderError("PROVIDER_KEY_INVALID", "The OpenAI API key is invalid.");
    });
    const service = createService(repository, cipherPort(), gateway);

    await expect(
      service.updatePreference({
        userId,
        modelId: "gpt-5.5",
        reasoningEffort: "medium",
        correlationId: "33333333-3333-4333-8333-333333333333"
      })
    ).rejects.toMatchObject({ code: "PROVIDER_KEY_INVALID" });

    expect(repository.savePreference).not.toHaveBeenCalled();
    expect(repository.updateValidation).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "invalid",
        operation: "preference_update"
      })
    );
  });

  it("does not serialize or reveal a SecretValue implicitly", () => {
    const secret = SecretValue.create(apiKey);
    expect(String(secret)).toBe("[redacted]");
    expect(JSON.stringify({ secret })).toBe('{"secret":"[redacted]"}');
    secret.destroy();
    expect(() => secret.use((value) => value)).toThrow("already been destroyed");
  });
});

function createService(
  repository: ProviderSettingsRepository,
  cipher: CredentialCipher,
  gateway: AiProviderGateway
) {
  return new ProviderSettingsService(
    repository,
    cipher,
    gateway,
    { defaultModel: "gpt-5.5", defaultReasoningEffort: "medium" },
    () => now,
    () => credentialId
  );
}

function repositoryPort(
  initial: ProviderSettingsSnapshot = { credential: null, preference: null }
): ProviderSettingsRepository {
  const encrypted = encryptedCredential();
  return {
    getSettings: vi.fn(async () => initial),
    getEncryptedCredential: vi.fn(async () => (initial.credential ? encrypted : null)),
    replaceCredential: vi.fn(async (input) => ({
      credential: {
        id: input.credentialId,
        last4: input.last4,
        status: "valid" as const,
        validatedAt: input.validatedAt,
        updatedAt: now
      },
      preference: input.preference
    })),
    updateValidation: vi.fn(async (input) => ({
      credential: {
        id: credentialId,
        last4: "3456",
        status: input.status,
        validatedAt: input.validatedAt,
        updatedAt: now
      },
      preference: initial.preference
    })),
    deleteCredential: vi.fn(async () => ({ credential: null, preference: null })),
    savePreference: vi.fn(async (input) => ({
      credential: configuredSnapshot().credential,
      preference: input.preference
    })),
    recordAudit: vi.fn(async () => undefined)
  };
}

function gatewayPort(): AiProviderGateway {
  const models = [
    { id: "gpt-5.5", reasoningEfforts: ["none", "low", "medium", "high"] as const }
  ];
  return {
    validateCredential: vi.fn(async () => ({ models })),
    listCompatibleModels: vi.fn(async () => models)
  };
}

function cipherPort(): CredentialCipher {
  return {
    encrypt: vi.fn((secret) => {
      expect(secret.use((value: string) => value)).toBe(apiKey);
      return encryptedCredential();
    }),
    decrypt: vi.fn(() => SecretValue.create(apiKey))
  };
}

function encryptedCredential(): StoredEncryptedCredential {
  return {
    id: credentialId,
    userId,
    provider: "openai",
    ciphertext: "ciphertext",
    nonce: "nonce",
    authTag: "auth-tag",
    algorithm: "AES-256-GCM",
    keyVersion: "v1",
    fingerprint: "f".repeat(64),
    last4: "3456",
    status: "valid",
    validatedAt: now,
    updatedAt: now
  };
}

function configuredSnapshot(): ProviderSettingsSnapshot {
  return {
    credential: {
      id: credentialId,
      last4: "3456",
      status: "valid",
      validatedAt: now,
      updatedAt: now
    },
    preference: {
      modelId: "gpt-5.5",
      reasoningEffort: "medium",
      reasoningMode: null,
      modelValidatedAt: now
    }
  };
}
