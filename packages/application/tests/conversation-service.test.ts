import { describe, expect, it, vi } from "vitest";
import {
  ConversationRunService,
  ConversationService,
  type ConversationRepository,
  type ConversationResponder
} from "../src";
import { Conversation } from "@agentic-csv/domain";

const now = new Date("2026-07-13T12:00:00.000Z");
const userId = "11111111-1111-4111-8111-111111111111";
const conversationId = "22222222-2222-4222-8222-222222222222";
const runId = "33333333-3333-4333-8333-333333333333";
const correlationId = "66666666-6666-4666-8666-666666666666";

describe("ConversationService", () => {
  it("creates a validated user-owned conversation", async () => {
    const repository = fakeRepository();
    repository.create = vi.fn(async (conversation) => conversation);
    const service = new ConversationService(
      repository,
      () => now,
      () => conversationId
    );

    const result = await service.create({ userId, title: "  Revenue   questions " });

    expect(result).toMatchObject({
      id: conversationId,
      userId,
      title: "Revenue questions",
      status: "active",
      version: 1
    });
  });

  it("returns the same not-found error for inaccessible conversations", async () => {
    const service = new ConversationService(fakeRepository());

    await expect(service.getDetail(userId, conversationId)).rejects.toEqual(
      expect.objectContaining({ code: "CONVERSATION_NOT_FOUND" })
    );
  });

  it("uses optimistic versions when renaming", async () => {
    const repository = fakeRepository();
    const current = Conversation.create({
      id: conversationId,
      userId,
      now
    }).toPrimitives();
    repository.getConversation = vi.fn(async () => current);
    repository.save = vi.fn(async ({ conversation }) => conversation);
    const service = new ConversationService(
      repository,
      () => new Date(now.getTime() + 1000)
    );

    const renamed = await service.rename({ userId, conversationId, title: "New title" });

    expect(renamed).toMatchObject({ title: "New title", version: 2 });
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ expectedVersion: 1 })
    );
  });
});

describe("ConversationRunService", () => {
  it("claims and completes a run through the responder port", async () => {
    const repository = fakeRepository();
    repository.claimRun = vi.fn(async () => ({
      userId,
      conversationId,
      runId,
      userMessageId: "44444444-4444-4444-8444-444444444444",
      content: "Compare revenue by country",
      selectedModel: "gpt-5.5",
      selectedReasoningEffort: "medium"
    }));
    const responder: ConversationResponder = {
      respond: vi.fn(async () => ({
        state: "completed" as const,
        text: "Persisted response"
      }))
    };
    const service = new ConversationRunService(
      repository,
      responder,
      () => now,
      () => "55555555-5555-4555-8555-555555555555"
    );

    await service.process({ userId, conversationId, runId, correlationId });

    expect(repository.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        assistantMessageId: "55555555-5555-4555-8555-555555555555",
        assistantText: "Persisted response",
        generatedTitle: "Compare revenue by country"
      })
    );
  });

  it("pauses the same run when the responder needs clarification", async () => {
    const repository = fakeRepository();
    repository.claimRun = vi.fn(async () => ({
      userId,
      conversationId,
      runId,
      userMessageId: "44444444-4444-4444-8444-444444444444",
      content: "Show revenue",
      selectedModel: "gpt-5.5",
      selectedReasoningEffort: "medium"
    }));
    const responder: ConversationResponder = {
      respond: vi.fn(async () => ({
        state: "waiting_for_user" as const,
        clarification: {
          id: "77777777-7777-4777-8777-777777777777",
          question: "Which revenue definition?",
          options: [{ value: "net_revenue", label: "Net revenue", columnId: null }],
          status: "pending" as const,
          answer: null
        },
        checkpoint: {} as never,
        metrics: { stepCount: 5, repairCount: 0, toolCallCount: 1 }
      }))
    };

    await new ConversationRunService(repository, responder, () => now).process({
      userId,
      conversationId,
      runId,
      correlationId
    });

    expect(repository.pauseRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId,
        clarification: expect.objectContaining({ question: "Which revenue definition?" })
      })
    );
    expect(repository.completeRun).not.toHaveBeenCalled();
  });

  it("stores only a safe failure when the responder throws", async () => {
    const repository = fakeRepository();
    repository.claimRun = vi.fn(async () => ({
      userId,
      conversationId,
      runId,
      userMessageId: "44444444-4444-4444-8444-444444444444",
      content: "Secret-bearing prompt",
      selectedModel: null,
      selectedReasoningEffort: null
    }));
    const responder: ConversationResponder = {
      respond: vi.fn(async () => {
        throw new Error("provider detail must not persist");
      })
    };
    const onUnexpectedFailure = vi.fn();
    await new ConversationRunService(
      repository,
      responder,
      () => now,
      undefined,
      onUnexpectedFailure
    ).process({
      userId,
      conversationId,
      runId,
      correlationId
    });

    expect(repository.failRun).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "ASSISTANT_RESPONSE_FAILED",
        message: "The assistant could not complete this response."
      })
    );
    expect(JSON.stringify(vi.mocked(repository.failRun).mock.calls)).not.toContain(
      "provider detail"
    );
    expect(onUnexpectedFailure).toHaveBeenCalledWith({
      correlationId,
      conversationId,
      runId,
      errorName: "Error"
    });
    expect(JSON.stringify(onUnexpectedFailure.mock.calls)).not.toContain(
      "provider detail"
    );
  });
});

function fakeRepository(): ConversationRepository {
  return {
    create: vi.fn(async (conversation) => conversation),
    list: vi.fn(async () => ({ conversations: [], nextCursor: null })),
    getConversation: vi.fn(async () => null),
    getDetail: vi.fn(async () => null),
    save: vi.fn(async () => null),
    attachDatasetVersion: vi.fn(async () => ({
      state: "conversation_not_found" as const
    })),
    delete: vi.fn(async () => false),
    enqueueMessage: vi.fn(async () => ({
      messageId: crypto.randomUUID(),
      runId: crypto.randomUUID(),
      replayed: false
    })),
    claimRun: vi.fn(async () => null),
    completeRun: vi.fn(async () => undefined),
    pauseRun: vi.fn(async () => undefined),
    resumeRun: vi.fn(async () => null),
    recordRunProgress: vi.fn(async () => true),
    isRunCancelled: vi.fn(async () => false),
    failRun: vi.fn(async () => undefined),
    cancelRun: vi.fn(async () => null),
    listRunEvents: vi.fn(async () => null)
  };
}
