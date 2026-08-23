import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Job } from "bullmq";
import type {
  MemoryDeletionService,
  MemoryIndexingService
} from "@agentic-csv/application";
import { createSilentLogger } from "@agentic-csv/infrastructure";
import { processKnowledgeDeleteJob } from "../src/processors/knowledge-delete.processor";
import { processKnowledgeIndexJob } from "../src/processors/knowledge-index.processor";

const userId = randomUUID();
const datasetId = randomUUID();
const datasetVersionId = randomUUID();

describe("knowledge queue processors", () => {
  it("validates and forwards a versioned indexing payload", async () => {
    const process = vi.fn(async () => 2);
    const payload = {
      version: 1,
      jobName: "knowledge.index.v1",
      correlationId: randomUUID(),
      userId,
      idempotencyKey: `dataset-schema:${datasetVersionId}`,
      source: "dataset-schema",
      datasetId,
      datasetVersionId
    };

    await processKnowledgeIndexJob(
      { id: "index-1", data: payload } as Job<unknown>,
      { process } as unknown as MemoryIndexingService,
      createSilentLogger()
    );

    expect(process).toHaveBeenCalledWith(payload);
  });

  it("rejects an incomplete conversation deletion before reaching Qdrant", async () => {
    const process = vi.fn(async () => undefined);
    const payload = {
      version: 1,
      jobName: "knowledge.delete.v1",
      correlationId: randomUUID(),
      userId,
      idempotencyKey: "conversation-delete:missing-id",
      scope: "conversation"
    };

    await expect(
      processKnowledgeDeleteJob(
        { id: "delete-1", data: payload } as Job<unknown>,
        { process } as unknown as MemoryDeletionService,
        createSilentLogger()
      )
    ).rejects.toThrow();
    expect(process).not.toHaveBeenCalled();
  });
});
