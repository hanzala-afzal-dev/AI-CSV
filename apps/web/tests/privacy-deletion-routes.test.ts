import { beforeEach, describe, expect, it, vi } from "vitest";

const ids = {
  user: "11111111-1111-4111-8111-111111111111",
  session: "22222222-2222-4222-8222-222222222222",
  dataset: "33333333-3333-4333-8333-333333333333",
  deletion: "44444444-4444-4444-8444-444444444444",
  request: "55555555-5555-4555-8555-555555555555"
};

const state = vi.hoisted(() => ({
  reauthenticate: vi.fn(),
  scheduleDataset: vi.fn(),
  scheduleAccount: vi.fn(),
  verifyCsrf: vi.fn(() => true)
}));

vi.mock("../src/server/runtime", () => ({
  ensureRedisConnected: vi.fn(async () => undefined),
  getRuntime: () => ({
    env: {
      APP_URL: "https://csv.example.com",
      AUTH_SECRET: "test-secret",
      NODE_ENV: "test",
      RATE_LIMIT_MAX_REQUESTS: 100,
      RATE_LIMIT_RECOVERY_MAX_REQUESTS: 5,
      RATE_LIMIT_WINDOW_SECONDS: 60,
      SESSION_ABSOLUTE_TTL_SECONDS: 3600,
      SESSION_COOKIE_NAME: "agentic_csv_session",
      SESSION_IDLE_TTL_SECONDS: 1800,
      TRUST_PROXY: false
    },
    identityService: {
      authenticateSession: vi.fn(async () => ({
        id: ids.session,
        userId: ids.user,
        csrfHash: "hash",
        createdAt: new Date("2026-08-23T10:00:00.000Z"),
        lastSeenAt: new Date("2026-08-23T10:00:00.000Z"),
        idleExpiresAt: new Date("2026-08-23T10:30:00.000Z"),
        absoluteExpiresAt: new Date("2026-08-23T11:00:00.000Z"),
        user: {
          id: ids.user,
          email: "alice@example.com",
          pendingEmail: null,
          displayName: "Alice",
          emailVerified: true
        }
      })),
      verifyCsrf: state.verifyCsrf,
      reauthenticate: state.reauthenticate
    },
    privacyDeletionService: {
      scheduleDataset: state.scheduleDataset,
      scheduleAccount: state.scheduleAccount
    },
    rateLimiter: {
      check: vi.fn(async () => ({
        allowed: true,
        limit: 5,
        remaining: 4,
        resetAt: new Date("2026-08-23T10:01:00.000Z")
      }))
    },
    redis: { isOpen: true },
    logger: { warn: vi.fn(), error: vi.fn() }
  })
}));

import { DELETE as deleteDatasetRoute } from "../src/app/api/v1/datasets/[datasetId]/route";
import { DELETE as deleteAccountRoute } from "../src/app/api/v1/me/route";

describe("privacy deletion routes", () => {
  beforeEach(() => {
    state.reauthenticate.mockReset().mockResolvedValue(undefined);
    state.verifyCsrf.mockReset().mockReturnValue(true);
    state.scheduleDataset.mockReset().mockResolvedValue({
      id: ids.deletion,
      userId: ids.user,
      scope: "dataset",
      datasetId: ids.dataset,
      status: "scheduled",
      requestedAt: new Date("2026-08-23T10:00:00.000Z")
    });
    state.scheduleAccount.mockReset().mockResolvedValue({
      id: ids.deletion,
      userId: ids.user,
      scope: "account",
      datasetId: null,
      status: "scheduled",
      requestedAt: new Date("2026-08-23T10:00:00.000Z")
    });
  });

  it("derives dataset ownership from the session and re-authenticates", async () => {
    const response = await deleteDatasetRoute(
      request(`/api/v1/datasets/${ids.dataset}`, {
        currentPassword: "correct password",
        clientRequestId: ids.request
      }),
      { params: Promise.resolve({ datasetId: ids.dataset }) }
    );

    expect(response.status).toBe(202);
    expect(state.reauthenticate).toHaveBeenCalledWith(ids.user, "correct password");
    expect(state.scheduleDataset).toHaveBeenCalledWith({
      userId: ids.user,
      datasetId: ids.dataset,
      clientRequestId: ids.request,
      correlationId: expect.any(String)
    });
  });

  it("requires a valid session-bound CSRF token", async () => {
    state.verifyCsrf.mockReturnValueOnce(false);
    const response = await deleteDatasetRoute(
      request(`/api/v1/datasets/${ids.dataset}`, {
        currentPassword: "correct password",
        clientRequestId: ids.request
      }),
      { params: Promise.resolve({ datasetId: ids.dataset }) }
    );

    expect(response.status).toBe(403);
    expect(state.scheduleDataset).not.toHaveBeenCalled();
  });

  it("requires explicit account confirmation and clears the session cookie", async () => {
    const invalid = await deleteAccountRoute(
      request("/api/v1/me", {
        currentPassword: "correct password",
        confirmation: "delete",
        clientRequestId: ids.request
      })
    );
    expect(invalid.status).toBe(422);
    expect(state.scheduleAccount).not.toHaveBeenCalled();

    const response = await deleteAccountRoute(
      request("/api/v1/me", {
        currentPassword: "correct password",
        confirmation: "DELETE",
        clientRequestId: ids.request
      })
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(state.scheduleAccount).toHaveBeenCalledWith({
      userId: ids.user,
      clientRequestId: ids.request,
      correlationId: expect.any(String)
    });
  });
});

function request(path: string, body: unknown): Request {
  return new Request(`https://csv.example.com${path}`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      cookie: "agentic_csv_session=valid-session",
      origin: "https://csv.example.com",
      "x-csrf-token": "valid-csrf"
    },
    body: JSON.stringify(body)
  });
}
