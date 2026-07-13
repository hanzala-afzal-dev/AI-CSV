import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => {
  const userId = "22222222-2222-4222-8222-222222222222";
  const now = new Date("2026-07-13T12:00:00.000Z");
  const settings = {
    credential: {
      provider: "openai" as const,
      configured: true,
      last4: "3456",
      status: "valid" as const,
      validatedAt: now,
      updatedAt: now
    },
    preference: {
      modelId: "gpt-5.5",
      reasoningEffort: "medium" as const,
      reasoningMode: null,
      modelValidatedAt: now
    }
  };
  const models = [
    {
      id: "gpt-5.5",
      reasoningEfforts: ["none", "low", "medium", "high"] as const
    }
  ];
  return {
    userId,
    settings,
    models,
    denyProviderLimit: false,
    rateLimitKeys: [] as string[],
    logger: { warn: vi.fn(), error: vi.fn() },
    providerSettingsService: {
      getSettings: vi.fn(async () => settings),
      saveCredential: vi.fn(async () => ({ settings, models })),
      revalidateCredential: vi.fn(async () => ({ settings, models })),
      listModels: vi.fn(async () => models),
      updatePreference: vi.fn(async () => ({ settings, models })),
      deleteCredential: vi.fn(async () => ({
        credential: {
          provider: "openai" as const,
          configured: false,
          last4: null,
          status: "unconfigured" as const,
          validatedAt: null,
          updatedAt: null
        },
        preference: null
      }))
    }
  };
});

const session = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: state.userId,
  csrfHash: "stored-csrf-hash",
  createdAt: new Date("2026-07-13T10:00:00.000Z"),
  lastSeenAt: new Date("2026-07-13T11:59:00.000Z"),
  idleExpiresAt: new Date("2026-07-13T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-07-20T10:00:00.000Z"),
  user: {
    id: state.userId,
    email: "alice@example.com",
    pendingEmail: null,
    displayName: "Alice",
    emailVerified: true
  }
};

vi.mock("../src/server/runtime", () => ({
  ensureRedisConnected: vi.fn(async () => undefined),
  getRuntime: () => ({
    env: {
      APP_URL: "https://csv.example.com",
      AUTH_SECRET: "a".repeat(32),
      SESSION_COOKIE_NAME: "agentic_csv_session",
      SESSION_ABSOLUTE_TTL_SECONDS: 604800,
      NODE_ENV: "test",
      TRUST_PROXY: true,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      RATE_LIMIT_MAX_REQUESTS: 100,
      RATE_LIMIT_CREDENTIAL_VALIDATION_MAX_REQUESTS: 5
    },
    identityService: {
      authenticateSession: vi.fn(async (token: string) =>
        token === "valid-session" ? session : null
      ),
      verifyCsrf: vi.fn((_session: unknown, token: string) => token === "csrf-token")
    },
    rateLimiter: {
      check: vi.fn(async ({ key, limit }: { key: string; limit: number }) => {
        state.rateLimitKeys.push(key);
        const allowed =
          !state.denyProviderLimit || !key.startsWith("provider:openai:validation:");
        return {
          allowed,
          limit,
          remaining: allowed ? limit - 1 : 0,
          resetAt: new Date(Date.now() + 60_000)
        };
      })
    },
    logger: state.logger,
    providerSettingsService: state.providerSettingsService
  })
}));

import { PUT as putCredential } from "../src/app/api/v1/settings/providers/openai/credential/route";
import { GET as getModels } from "../src/app/api/v1/settings/providers/openai/models/route";
import { PUT as putPreference } from "../src/app/api/v1/settings/providers/openai/preferences/route";

const apiKey = "sk-test-abcdefghijklmnopqrstuvwxyz123456";
const correlationId = "44444444-4444-4444-8444-444444444444";

describe("OpenAI provider settings routes", () => {
  beforeEach(() => {
    state.denyProviderLimit = false;
    state.rateLimitKeys.length = 0;
    state.logger.warn.mockReset();
    state.logger.error.mockReset();
    state.providerSettingsService.getSettings
      .mockReset()
      .mockResolvedValue(state.settings);
    state.providerSettingsService.saveCredential
      .mockReset()
      .mockResolvedValue({ settings: state.settings, models: state.models });
    state.providerSettingsService.revalidateCredential
      .mockReset()
      .mockResolvedValue({ settings: state.settings, models: state.models });
    state.providerSettingsService.listModels.mockReset().mockResolvedValue(state.models);
    state.providerSettingsService.updatePreference
      .mockReset()
      .mockResolvedValue({ settings: state.settings, models: state.models });
    state.providerSettingsService.deleteCredential.mockClear();
  });

  it("derives ownership from the session and returns only safe credential metadata", async () => {
    const response = await putCredential(mutationRequest("/credential", { apiKey }));
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(200);
    expect(body.correlationId).toBe(correlationId);
    expect(state.providerSettingsService.saveCredential).toHaveBeenCalledWith({
      userId: state.userId,
      apiKey,
      correlationId
    });
    expect(serialized).toContain("3456");
    expect(serialized).not.toContain(apiKey);
    expect(serialized).not.toContain("ciphertext");
    expect(serialized).not.toContain("authTag");
  });

  it("rejects credential writes without the session-bound CSRF token", async () => {
    const response = await putCredential(
      mutationRequest("/credential", { apiKey }, { csrfToken: null })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CSRF_TOKEN_INVALID" }
    });
    expect(state.providerSettingsService.saveCredential).not.toHaveBeenCalled();
  });

  it("fails closed on the dedicated provider-validation limit", async () => {
    state.denyProviderLimit = true;
    const response = await putCredential(mutationRequest("/credential", { apiKey }));

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBeTruthy();
    expect(state.rateLimitKeys).toEqual([
      `browser:user:${state.userId}`,
      `provider:openai:validation:user:${state.userId}`
    ]);
    expect(state.providerSettingsService.saveCredential).not.toHaveBeenCalled();
  });

  it("does not log or return a key even when an internal error contains it", async () => {
    state.providerSettingsService.saveCredential.mockRejectedValueOnce(
      new Error(`upstream failure while handling ${apiKey}`)
    );
    const response = await putCredential(mutationRequest("/credential", { apiKey }));
    const responseText = await response.text();

    expect(response.status).toBe(500);
    expect(responseText).not.toContain(apiKey);
    expect(JSON.stringify(state.logger.error.mock.calls)).not.toContain(apiKey);
    expect(state.logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ correlationId, code: "INTERNAL_ERROR" }),
      "API request failed"
    );
  });

  it("rejects mass-assignment and SQL-injection-shaped preference input", async () => {
    const credentialResponse = await putCredential(
      mutationRequest("/credential", { apiKey, userId: "bob" })
    );
    const preferenceResponse = await putPreference(
      mutationRequest("/preferences", {
        modelId: "gpt-5.5'; drop table provider_credentials; --",
        reasoningEffort: "medium"
      })
    );

    expect(credentialResponse.status).toBe(422);
    expect(preferenceResponse.status).toBe(422);
    expect(state.providerSettingsService.saveCredential).not.toHaveBeenCalled();
    expect(state.providerSettingsService.updatePreference).not.toHaveBeenCalled();
  });

  it("loads models with the saved server-side key and the dedicated limit", async () => {
    const response = await getModels(queryRequest("/models"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { models: [{ id: "gpt-5.5" }] }
    });
    expect(state.providerSettingsService.listModels).toHaveBeenCalledWith({
      userId: state.userId,
      correlationId
    });
    expect(state.rateLimitKeys).toEqual([
      `provider:openai:validation:user:${state.userId}`
    ]);
  });
});

function mutationRequest(
  path: string,
  body: unknown,
  options: { readonly csrfToken?: string | null } = {}
): Request {
  const csrfToken = options.csrfToken === undefined ? "csrf-token" : options.csrfToken;
  const headers = new Headers({
    "content-type": "application/json",
    origin: "https://csv.example.com",
    "sec-fetch-site": "same-origin",
    cookie: "agentic_csv_session=valid-session",
    "x-correlation-id": correlationId
  });
  if (csrfToken) headers.set("x-csrf-token", csrfToken);
  return new Request(`https://csv.example.com/api/v1/settings/providers/openai${path}`, {
    method: "PUT",
    headers,
    body: JSON.stringify(body)
  });
}

function queryRequest(path: string): Request {
  return new Request(`https://csv.example.com/api/v1/settings/providers/openai${path}`, {
    headers: {
      cookie: "agentic_csv_session=valid-session",
      "x-correlation-id": correlationId
    }
  });
}
