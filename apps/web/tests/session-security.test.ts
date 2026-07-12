import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  csrfToken: "csrf-current",
  rateLimitKeys: [] as string[]
}));

const session = {
  id: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  csrfHash: "stored-hash",
  createdAt: new Date("2026-07-12T10:00:00Z"),
  lastSeenAt: new Date("2026-07-12T10:00:00Z"),
  idleExpiresAt: new Date("2026-07-12T11:00:00Z"),
  absoluteExpiresAt: new Date("2026-07-19T10:00:00Z"),
  user: {
    id: "22222222-2222-4222-8222-222222222222",
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
      RATE_LIMIT_LOGIN_MAX_REQUESTS: 10,
      RATE_LIMIT_RECOVERY_MAX_REQUESTS: 5
    },
    identityService: {
      authenticateSession: vi.fn(async (token: string) =>
        token === "valid-session" ? session : null
      ),
      verifyCsrf: vi.fn((_session: unknown, token: string) => token === state.csrfToken),
      revokeSession: vi.fn(
        async (userId: string, sessionId: string) =>
          userId === session.userId && sessionId === session.id
      )
    },
    rateLimiter: {
      check: vi.fn(async ({ key, limit }: { key: string; limit: number }) => {
        state.rateLimitKeys.push(key);
        return {
          allowed: true,
          limit,
          remaining: limit - 1,
          resetAt: new Date(Date.now() + 60_000)
        };
      })
    },
    logger: { warn: vi.fn(), error: vi.fn() }
  })
}));

import { authorizeBrowserMutation, protectPublicAuthRequest } from "../src/server/http";
import { DELETE as revokeSessionRoute } from "../src/app/api/v1/me/sessions/[sessionId]/route";

describe("browser session and CSRF security", () => {
  beforeEach(() => {
    state.csrfToken = "csrf-current";
    state.rateLimitKeys.length = 0;
  });

  it("accepts a session-bound CSRF token", async () => {
    const context = await authorizeBrowserMutation(
      requestWith({ "x-csrf-token": "csrf-current" })
    );
    expect(context.session.userId).toBe(session.userId);
  });

  it("rejects a missing or invalid CSRF token", async () => {
    await expect(authorizeBrowserMutation(requestWith({}))).rejects.toMatchObject({
      code: "CSRF_TOKEN_INVALID"
    });
    await expect(
      authorizeBrowserMutation(requestWith({ "x-csrf-token": "wrong" }))
    ).rejects.toMatchObject({ code: "CSRF_TOKEN_INVALID" });
  });

  it("rejects replay after CSRF rotation", async () => {
    await authorizeBrowserMutation(requestWith({ "x-csrf-token": "csrf-current" }));
    state.csrfToken = "csrf-rotated";
    await expect(
      authorizeBrowserMutation(requestWith({ "x-csrf-token": "csrf-current" }))
    ).rejects.toMatchObject({ code: "CSRF_TOKEN_INVALID" });
    await expect(
      authorizeBrowserMutation(requestWith({ "x-csrf-token": "csrf-rotated" }))
    ).resolves.toBeDefined();
  });

  it("uses hashed IP and identifier rate-limit buckets", async () => {
    const request = requestWith({}, { "x-forwarded-for": "203.0.113.9" });
    await protectPublicAuthRequest(request, "login", "Alice@Example.com");
    expect(state.rateLimitKeys).toHaveLength(2);
    expect(state.rateLimitKeys.join(" ")).not.toContain("alice@example.com");
    expect(state.rateLimitKeys.join(" ")).not.toContain("203.0.113.9");
  });

  it("does not let Alice revoke Bob's session through the API", async () => {
    const bobSessionId = "33333333-3333-4333-8333-333333333333";
    const response = await revokeSessionRoute(
      requestWith({ "x-csrf-token": "csrf-current" }),
      { params: Promise.resolve({ sessionId: bobSessionId }) }
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SESSION_NOT_FOUND" }
    });
  });
});

function requestWith(
  extra: Record<string, string>,
  headers: Record<string, string> = {}
): Request {
  return new Request("https://csv.example.com/api/v1/me/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      origin: "https://csv.example.com",
      "sec-fetch-site": "same-origin",
      cookie: "agentic_csv_session=valid-session",
      ...headers,
      ...extra
    }
  });
}
