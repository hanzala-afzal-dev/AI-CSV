import { describe, expect, it, vi } from "vitest";
import {
  AgentProviderService,
  SecretValue,
  type AgentModelGateway,
  type CredentialCipher,
  type ProviderSettingsRepository
} from "../src";

const userId = "11111111-1111-4111-8111-111111111111";

describe("AgentProviderService", () => {
  it("uses the run model snapshot and destroys decrypted credentials after work", async () => {
    const secret = SecretValue.create("sk-test-agent-secret");
    const gateway = gatewayPort();
    const service = new AgentProviderService(
      repositoryPort(),
      { decrypt: vi.fn(() => secret) } as unknown as CredentialCipher,
      gateway
    );

    const selected = await service.withSession(
      userId,
      { modelId: "gpt-5.5", reasoningEffort: "high" },
      async (session) => ({ modelId: session.modelId, effort: session.reasoningEffort })
    );

    expect(selected).toEqual({ modelId: "gpt-5.5", effort: "high" });
    expect(() => secret.use((value) => value)).toThrow("already been destroyed");
  });

  it("destroys decrypted credentials when provider work fails", async () => {
    const secret = SecretValue.create("sk-test-agent-secret");
    const service = new AgentProviderService(
      repositoryPort(),
      { decrypt: vi.fn(() => secret) } as unknown as CredentialCipher,
      gatewayPort()
    );

    await expect(
      service.withSession(userId, { modelId: null, reasoningEffort: null }, async () => {
        throw new Error("model failure");
      })
    ).rejects.toThrow("model failure");
    expect(() => secret.use((value) => value)).toThrow("already been destroyed");
  });
});

function repositoryPort(): ProviderSettingsRepository {
  return {
    getSettings: vi.fn(async () => ({
      credential: {
        id: "22222222-2222-4222-8222-222222222222",
        last4: "cret",
        status: "valid" as const,
        validatedAt: new Date(),
        updatedAt: new Date()
      },
      preference: {
        modelId: "gpt-5-mini",
        reasoningEffort: "medium" as const,
        reasoningMode: null,
        modelValidatedAt: new Date()
      }
    })),
    getEncryptedCredential: vi.fn(async () => ({
      id: "22222222-2222-4222-8222-222222222222",
      userId,
      provider: "openai" as const,
      ciphertext: "ciphertext",
      nonce: "nonce",
      authTag: "tag",
      algorithm: "AES-256-GCM" as const,
      keyVersion: "v1",
      fingerprint: "fingerprint",
      last4: "cret",
      status: "valid" as const,
      validatedAt: new Date(),
      updatedAt: new Date()
    }))
  } as unknown as ProviderSettingsRepository;
}

function gatewayPort(): AgentModelGateway {
  return {
    createPlan: vi.fn(),
    createExplanation: vi.fn()
  };
}
