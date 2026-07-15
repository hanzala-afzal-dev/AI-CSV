import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConversationError } from "@agentic-csv/application";

const state = vi.hoisted(() => {
  const userId = "11111111-1111-4111-8111-111111111111";
  const conversationId = "22222222-2222-4222-8222-222222222222";
  const messageId = "33333333-3333-4333-8333-333333333333";
  const runId = "44444444-4444-4444-8444-444444444444";
  const now = new Date("2026-07-13T12:00:00.000Z");
  const conversation = {
    id: conversationId,
    userId,
    title: "Revenue questions",
    status: "active" as const,
    activeDatasetId: null,
    activeDatasetVersionId: null,
    lastMessageSequence: 0,
    lastActivityAt: now,
    version: 1,
    createdAt: now,
    updatedAt: now
  };
  return {
    userId,
    conversationId,
    messageId,
    runId,
    now,
    conversation,
    denySubmission: false,
    denyLease: false,
    rateLimitKeys: [] as string[],
    logger: { warn: vi.fn(), error: vi.fn() },
    leaseLimiter: { acquire: vi.fn(), release: vi.fn() },
    conversationService: {
      create: vi.fn(),
      list: vi.fn(),
      getDetail: vi.fn(),
      rename: vi.fn(),
      setActiveDataset: vi.fn(),
      setArchived: vi.fn(),
      delete: vi.fn(),
      submitMessage: vi.fn(),
      cancelRun: vi.fn(),
      listRunEvents: vi.fn()
    }
  };
});

const session = {
  id: "55555555-5555-4555-8555-555555555555",
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
      RATE_LIMIT_CHAT_SUBMISSION_MAX_REQUESTS: 20,
      RATE_LIMIT_SSE_CONNECTION_MAX_REQUESTS: 30,
      SSE_MAX_CONNECTIONS_PER_USER: 3,
      SSE_CONNECTION_LEASE_SECONDS: 35
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
          !state.denySubmission || !key.startsWith("conversation:submission:");
        return {
          allowed,
          limit,
          remaining: allowed ? limit - 1 : 0,
          resetAt: new Date(Date.now() + 60_000)
        };
      })
    },
    leaseLimiter: state.leaseLimiter,
    logger: state.logger,
    conversationService: state.conversationService
  })
}));

import { POST as createConversationRoute } from "../src/app/api/v1/conversations/route";
import {
  GET as getConversationRoute,
  PATCH as updateConversationRoute
} from "../src/app/api/v1/conversations/[conversationId]/route";
import { POST as submitMessageRoute } from "../src/app/api/v1/conversations/[conversationId]/messages/route";
import { GET as streamEventsRoute } from "../src/app/api/v1/conversations/[conversationId]/runs/[runId]/events/route";

const correlationId = "66666666-6666-4666-8666-666666666666";

describe("conversation routes", () => {
  beforeEach(() => {
    state.denySubmission = false;
    state.denyLease = false;
    state.rateLimitKeys.length = 0;
    state.logger.warn.mockReset();
    state.logger.error.mockReset();
    state.leaseLimiter.acquire
      .mockReset()
      .mockImplementation(async () => !state.denyLease);
    state.leaseLimiter.release.mockReset().mockResolvedValue(undefined);
    state.conversationService.create.mockReset().mockResolvedValue(state.conversation);
    state.conversationService.list.mockReset().mockResolvedValue({
      conversations: [state.conversation],
      nextCursor: null
    });
    state.conversationService.getDetail.mockReset().mockResolvedValue({
      conversation: state.conversation,
      messages: [],
      activeRun: null
    });
    state.conversationService.setActiveDataset.mockReset().mockResolvedValue({
      ...state.conversation,
      activeDatasetId: "88888888-8888-4888-8888-888888888888",
      activeDatasetVersionId: "99999999-9999-4999-8999-999999999999"
    });
    state.conversationService.submitMessage.mockReset().mockResolvedValue({
      messageId: state.messageId,
      runId: state.runId,
      replayed: false
    });
    state.conversationService.listRunEvents.mockReset().mockResolvedValue({
      status: "completed",
      events: [
        {
          id: "4",
          runId: state.runId,
          sequence: 4,
          type: "run.completed",
          occurredAt: state.now,
          payload: { version: 1, messageId: state.messageId }
        }
      ]
    });
  });

  it("creates a conversation for the authenticated user only", async () => {
    const response = await createConversationRoute(mutationRequest("/conversations", {}));

    expect(response.status).toBe(201);
    expect(state.conversationService.create).toHaveBeenCalledWith({
      userId: state.userId
    });
    const body = await response.json();
    expect(body.data.conversation).not.toHaveProperty("userId");
  });

  it("rejects mass-assigned ownership before calling the service", async () => {
    const response = await createConversationRoute(
      mutationRequest("/conversations", { userId: "bob" })
    );

    expect(response.status).toBe(422);
    expect(state.conversationService.create).not.toHaveBeenCalled();
  });

  it("returns ownership-safe not found responses", async () => {
    state.conversationService.getDetail.mockRejectedValueOnce(
      new ConversationError("CONVERSATION_NOT_FOUND", "Conversation not found.")
    );
    const response = await getConversationRoute(queryRequest("/conversations/foreign"), {
      params: Promise.resolve({ conversationId: state.conversationId })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONVERSATION_NOT_FOUND", message: "Conversation not found." }
    });
  });

  it("attaches only a session-owned dataset version using a strict request", async () => {
    const versionId = "99999999-9999-4999-8999-999999999999";
    const response = await updateConversationRoute(
      mutationRequest(`/conversations/${state.conversationId}`, {
        activeDatasetVersionId: versionId
      }),
      { params: Promise.resolve({ conversationId: state.conversationId }) }
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(state.conversationService.setActiveDataset).toHaveBeenCalledWith({
      userId: state.userId,
      conversationId: state.conversationId,
      datasetVersionId: versionId
    });
    expect(body.data.conversation.activeDataset).toEqual({
      datasetId: "88888888-8888-4888-8888-888888888888",
      datasetVersionId: versionId
    });

    const massAssigned = await updateConversationRoute(
      mutationRequest(`/conversations/${state.conversationId}`, {
        activeDatasetVersionId: versionId,
        activeDatasetId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
      }),
      { params: Promise.resolve({ conversationId: state.conversationId }) }
    );
    expect(massAssigned.status).toBe(422);
  });

  it("requires CSRF and a dedicated submission rate limit", async () => {
    const withoutCsrf = await submitMessageRoute(
      mutationRequest(
        `/conversations/${state.conversationId}/messages`,
        {
          clientRequestId: "77777777-7777-4777-8777-777777777777",
          content: "Hello"
        },
        null
      ),
      { params: Promise.resolve({ conversationId: state.conversationId }) }
    );
    expect(withoutCsrf.status).toBe(403);

    state.denySubmission = true;
    const limited = await submitMessageRoute(
      mutationRequest(`/conversations/${state.conversationId}/messages`, {
        clientRequestId: "77777777-7777-4777-8777-777777777777",
        content: "Hello"
      }),
      { params: Promise.resolve({ conversationId: state.conversationId }) }
    );
    expect(limited.status).toBe(429);
    expect(state.rateLimitKeys).toEqual([
      `browser:user:${state.userId}`,
      `conversation:submission:user:${state.userId}`
    ]);
    expect(state.conversationService.submitMessage).not.toHaveBeenCalled();
  });

  it("derives message ownership from the session and returns the durable stream URL", async () => {
    const requestId = "77777777-7777-4777-8777-777777777777";
    const response = await submitMessageRoute(
      mutationRequest(`/conversations/${state.conversationId}/messages`, {
        clientRequestId: requestId,
        content: "Compare revenue"
      }),
      { params: Promise.resolve({ conversationId: state.conversationId }) }
    );

    expect(response.status).toBe(202);
    expect(state.conversationService.submitMessage).toHaveBeenCalledWith({
      userId: state.userId,
      conversationId: state.conversationId,
      clientRequestId: requestId,
      content: "Compare revenue",
      correlationId
    });
    await expect(response.json()).resolves.toMatchObject({
      data: {
        runId: state.runId,
        eventsUrl: `/api/v1/conversations/${state.conversationId}/runs/${state.runId}/events`
      }
    });
  });

  it("replays SSE after Last-Event-ID and releases the concurrent-stream lease", async () => {
    const request = queryRequest(
      `/conversations/${state.conversationId}/runs/${state.runId}/events`,
      { "last-event-id": "3" }
    );
    const response = await streamEventsRoute(request, {
      params: Promise.resolve({
        conversationId: state.conversationId,
        runId: state.runId
      })
    });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(body).toContain("id: 4");
    expect(body).toContain("event: run.completed");
    expect(state.conversationService.listRunEvents).toHaveBeenCalledWith({
      userId: state.userId,
      conversationId: state.conversationId,
      runId: state.runId,
      afterSequence: 3
    });
    expect(state.leaseLimiter.acquire).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 3, ttlSeconds: 35 })
    );
    expect(state.leaseLimiter.release).toHaveBeenCalledTimes(1);
  });

  it("drains every event page before closing a terminal SSE stream", async () => {
    state.conversationService.listRunEvents
      .mockResolvedValueOnce({
        status: "completed",
        events: Array.from({ length: 100 }, (_, index) => ({
          id: String(index + 1),
          runId: state.runId,
          sequence: index + 1,
          type: "run.queued",
          occurredAt: state.now,
          payload: { version: 1 }
        }))
      })
      .mockResolvedValueOnce({
        status: "completed",
        events: [
          {
            id: "101",
            runId: state.runId,
            sequence: 101,
            type: "run.completed",
            occurredAt: state.now,
            payload: { version: 1, messageId: state.messageId }
          }
        ]
      });

    const response = await streamEventsRoute(
      queryRequest(`/conversations/${state.conversationId}/runs/${state.runId}/events`),
      {
        params: Promise.resolve({
          conversationId: state.conversationId,
          runId: state.runId
        })
      }
    );
    const body = await response.text();

    expect(body).toContain("id: 100");
    expect(body).toContain("id: 101");
    expect(state.conversationService.listRunEvents).toHaveBeenNthCalledWith(2, {
      userId: state.userId,
      conversationId: state.conversationId,
      runId: state.runId,
      afterSequence: 100,
      limit: 100
    });
    expect(state.leaseLimiter.release).toHaveBeenCalledTimes(1);
  });

  it("fails closed when the account has too many SSE connections", async () => {
    state.denyLease = true;
    const response = await streamEventsRoute(
      queryRequest(`/conversations/${state.conversationId}/runs/${state.runId}/events`),
      {
        params: Promise.resolve({
          conversationId: state.conversationId,
          runId: state.runId
        })
      }
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SSE_CONNECTION_LIMIT_EXCEEDED" }
    });
    expect(state.conversationService.listRunEvents).not.toHaveBeenCalled();
  });
});

function mutationRequest(
  path: string,
  body: unknown,
  csrfToken: string | null = "csrf-token"
) {
  const headers = new Headers({
    "content-type": "application/json",
    origin: "https://csv.example.com",
    "sec-fetch-site": "same-origin",
    cookie: "agentic_csv_session=valid-session",
    "x-correlation-id": correlationId
  });
  if (csrfToken) headers.set("x-csrf-token", csrfToken);
  return new Request(`https://csv.example.com/api/v1${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body)
  });
}

function queryRequest(path: string, extraHeaders: Record<string, string> = {}) {
  return new Request(`https://csv.example.com/api/v1${path}`, {
    headers: {
      cookie: "agentic_csv_session=valid-session",
      "x-correlation-id": correlationId,
      ...extraHeaders
    }
  });
}
