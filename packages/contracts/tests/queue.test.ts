import { describe, expect, it } from "vitest";
import { agentRunJobPayloadSchema, datasetIngestionJobPayloadSchema } from "../src";

describe("dataset ingestion queue contract", () => {
  it("accepts a versioned dataset ingestion payload", () => {
    const parsed = datasetIngestionJobPayloadSchema.parse({
      version: 1,
      jobName: "dataset.ingest.v1",
      correlationId: "corr_1",
      userId: "33333333-3333-4333-8333-333333333333",
      datasetId: "11111111-1111-4111-8111-111111111111",
      datasetVersionId: "22222222-2222-4222-8222-222222222222",
      objectKey:
        "users/33333333-3333-4333-8333-333333333333/datasets/11111111-1111-4111-8111-111111111111/versions/22222222-2222-4222-8222-222222222222/original.csv",
      idempotencyKey: "upload-complete-11111111"
    });

    expect(parsed.jobName).toBe("dataset.ingest.v1");
  });

  it("rejects unversioned or malformed payloads", () => {
    expect(() =>
      datasetIngestionJobPayloadSchema.parse({
        jobName: "dataset.ingest",
        correlationId: "corr_1"
      })
    ).toThrow();
  });
});

describe("agent run queue contract", () => {
  it("accepts only a versioned, tenant-scoped run payload", () => {
    const parsed = agentRunJobPayloadSchema.parse({
      version: 1,
      jobName: "agent.run.v1",
      correlationId: "correlation-1",
      userId: "11111111-1111-4111-8111-111111111111",
      idempotencyKey: "22222222-2222-4222-8222-222222222222",
      conversationId: "33333333-3333-4333-8333-333333333333",
      runId: "44444444-4444-4444-8444-444444444444"
    });

    expect(parsed.jobName).toBe("agent.run.v1");
    expect(() =>
      agentRunJobPayloadSchema.parse({ ...parsed, userId: undefined })
    ).toThrow();
  });
});
