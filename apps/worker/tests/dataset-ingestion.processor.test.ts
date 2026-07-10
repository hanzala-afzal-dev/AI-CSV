import { describe, expect, it } from "vitest";
import type { Job } from "bullmq";
import { createSilentLogger } from "@agentic-csv/infrastructure";
import { processDatasetIngestionJob } from "../src/processors/dataset-ingestion.processor";

describe("dataset ingestion processor", () => {
  it("validates a versioned owner-scoped payload", async () => {
    const job = {
      id: "job-1",
      data: {
        schemaVersion: 1,
        jobName: "dataset.ingest.v1",
        correlationId: "correlation-1",
        ownerId: "11111111-1111-4111-8111-111111111111",
        datasetId: "22222222-2222-4222-8222-222222222222",
        objectKey: "owners/owner/datasets/dataset/upload.csv",
        idempotencyKey: "upload-completion-key"
      }
    } as Job<unknown>;

    await expect(
      processDatasetIngestionJob(job, createSilentLogger())
    ).resolves.toBeUndefined();
  });

  it("rejects invalid payloads", async () => {
    const job = { id: "job-2", data: { jobName: "dataset.ingest.v1" } } as Job<unknown>;

    await expect(processDatasetIngestionJob(job, createSilentLogger())).rejects.toThrow();
  });
});
