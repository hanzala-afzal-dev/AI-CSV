import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuggestionError } from "@agentic-csv/application";

const state = vi.hoisted(() => ({
  userId: "11111111-1111-4111-8111-111111111111",
  conversationId: "22222222-2222-4222-8222-222222222222",
  suggestionService: { getForConversation: vi.fn() }
}));

vi.mock("../src/server/runtime", () => ({
  getRuntime: () => ({
    env: {
      SESSION_COOKIE_NAME: "agentic_csv_session",
      SESSION_IDLE_TTL_SECONDS: 3600
    },
    identityService: {
      authenticateSession: vi.fn(async (token: string) =>
        token === "valid-session"
          ? {
              id: "33333333-3333-4333-8333-333333333333",
              userId: state.userId,
              csrfHash: "hash",
              createdAt: new Date(),
              lastSeenAt: new Date(),
              idleExpiresAt: new Date(),
              absoluteExpiresAt: new Date(),
              user: {
                id: state.userId,
                email: "alice@example.com",
                pendingEmail: null,
                displayName: "Alice",
                emailVerified: true
              }
            }
          : null
      )
    },
    logger: { warn: vi.fn(), error: vi.fn() },
    suggestionService: state.suggestionService
  })
}));

import { GET as suggestionRoute } from "../src/app/api/v1/conversations/[conversationId]/suggestions/route";

describe("suggestion route", () => {
  beforeEach(() => {
    state.suggestionService.getForConversation.mockReset().mockResolvedValue({
      version: 1,
      state: "no_dataset",
      datasetVersionId: null,
      initial: [],
      followUps: []
    });
  });

  it("derives ownership only from the authenticated session", async () => {
    const response = await suggestionRoute(request(), {
      params: Promise.resolve({ conversationId: state.conversationId })
    });

    expect(response.status).toBe(200);
    expect(state.suggestionService.getForConversation).toHaveBeenCalledWith(
      state.userId,
      state.conversationId
    );
  });

  it("returns the same not-found response for hidden conversations", async () => {
    state.suggestionService.getForConversation.mockRejectedValueOnce(
      new SuggestionError("CONVERSATION_NOT_FOUND", "Conversation was not found.")
    );

    const response = await suggestionRoute(request(), {
      params: Promise.resolve({ conversationId: state.conversationId })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "CONVERSATION_NOT_FOUND" }
    });
  });
});

function request(): Request {
  return new Request(
    `https://csv.example.com/api/v1/conversations/${state.conversationId}/suggestions`,
    {
      headers: {
        cookie: "agentic_csv_session=valid-session",
        "x-request-id": "44444444-4444-4444-8444-444444444444"
      }
    }
  );
}
