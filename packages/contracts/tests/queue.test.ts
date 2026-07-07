import { describe, expect, it } from "vitest";
import { datasetIngestionJobPayloadSchema } from "../src";

describe("dataset ingestion queue contract", () => {
  it("accepts a versioned dataset ingestion payload", () => {
    const parsed = datasetIngestionJobPayloadSchema.parse({
      schemaVersion: 1,
      jobName: "dataset.ingest.v1",
      correlationId: "corr_1",
      ownerId: "owner_1",
      datasetId: "11111111-1111-4111-8111-111111111111",
      objectKey: "owners/owner_1/datasets/11111111-1111-4111-8111-111111111111/data.csv",
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
