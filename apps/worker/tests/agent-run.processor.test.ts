import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type { ConversationRunService } from "@agentic-csv/application";
import { createSilentLogger } from "@agentic-csv/infrastructure";
import { processAgentRunJob } from "../src/processors/agent-run.processor";

describe("agent run processor", () => {
  it("validates and forwards only the trusted queue payload", async () => {
    const process = vi.fn(async () => undefined);
    const service = { process } as unknown as ConversationRunService;
    const payload = {
      version: 1,
      jobName: "agent.run.v1",
      correlationId: "correlation-1",
      userId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      conversationId: "33333333-3333-4333-8333-333333333333",
      runId: "44444444-4444-4444-8444-444444444444"
    };

    await processAgentRunJob(
      { id: "job-1", data: payload } as Job<unknown>,
      service,
      createSilentLogger()
    );

    expect(process).toHaveBeenCalledWith(payload);
  });

  it("rejects malformed queue payloads before processing", async () => {
    const process = vi.fn(async () => undefined);
    const service = { process } as unknown as ConversationRunService;

    await expect(
      processAgentRunJob(
        { id: "job-2", data: { jobName: "agent.run.v1" } } as Job<unknown>,
        service,
        createSilentLogger()
      )
    ).rejects.toThrow();
    expect(process).not.toHaveBeenCalled();
  });
});
