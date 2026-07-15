import { describe, expect, it, vi } from "vitest";
import {
  DatasetFileValidationError,
  DatasetIngestionService,
  type CsvProfiler,
  type DatasetIngestionRepository,
  type ObjectStorage
} from "../src";
import type {
  DatasetIngestionJobPayload,
  DatasetProfileContract
} from "@agentic-csv/contracts";

const now = new Date("2026-07-15T12:00:00.000Z");
const payload: DatasetIngestionJobPayload = {
  version: 1,
  jobName: "dataset.ingest.v1",
  correlationId: "correlation-1",
  userId: "11111111-1111-4111-8111-111111111111",
  datasetId: "22222222-2222-4222-8222-222222222222",
  datasetVersionId: "33333333-3333-4333-8333-333333333333",
  objectKey:
    "users/11111111-1111-4111-8111-111111111111/datasets/22222222-2222-4222-8222-222222222222/versions/33333333-3333-4333-8333-333333333333/original.csv",
  idempotencyKey: "44444444-4444-4444-8444-444444444444"
};

describe("DatasetIngestionService", () => {
  it("reloads claimed work and completes a profile", async () => {
    const fixture = createFixture();
    const result = await fixture.service.process(payload, "job-1");

    expect(result).toBe("completed");
    expect(fixture.repository.markProfiling).toHaveBeenCalled();
    expect(fixture.repository.markIndexing).toHaveBeenCalled();
    expect(fixture.repository.complete).toHaveBeenCalledWith(
      expect.objectContaining({ profile })
    );
    expect(fixture.repository.fail).not.toHaveBeenCalled();
  });

  it("persists permanent validation failures without retrying the queue job", async () => {
    const fixture = createFixture();
    fixture.profiler.profile = vi.fn(async () => {
      throw new DatasetFileValidationError(
        "DATASET_MALFORMED_CSV",
        "Unsafe parser detail"
      );
    });

    await expect(fixture.service.process(payload, "job-1")).resolves.toBe(
      "failed_validation"
    );
    expect(fixture.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: "DATASET_MALFORMED_CSV" })
    );
  });

  it("rethrows transient storage failures for bounded BullMQ retry", async () => {
    const fixture = createFixture();
    fixture.storage.readObject = vi.fn(async () => {
      throw new Error("storage temporarily unavailable");
    });

    await expect(fixture.service.process(payload, "job-1")).rejects.toThrow(
      "storage temporarily unavailable"
    );
    expect(fixture.repository.fail).not.toHaveBeenCalled();
  });

  it("does not trust an object-key routing hint that differs from PostgreSQL", async () => {
    const fixture = createFixture();
    await expect(
      fixture.service.process({ ...payload, objectKey: "users/tampered.csv" }, "job-1")
    ).resolves.toBe("failed_validation");
    expect(fixture.storage.inspectObject).not.toHaveBeenCalled();
    expect(fixture.repository.fail).toHaveBeenCalledWith(
      expect.objectContaining({ code: "DATASET_JOB_CONTEXT_INVALID" })
    );
  });

  it("persists a safe terminal code after queue retries are exhausted", async () => {
    const fixture = createFixture();

    await fixture.service.failAfterRetries(payload, "job-1");

    expect(fixture.repository.fail).toHaveBeenCalledWith({
      userId: payload.userId,
      datasetId: payload.datasetId,
      datasetVersionId: payload.datasetVersionId,
      claimId: "job-1",
      occurredAt: now,
      code: "DATASET_PROCESSING_FAILED"
    });
  });
});

function createFixture() {
  const repository = {
    claim: vi.fn(async () => ({
      state: "claimed" as const,
      work: {
        userId: payload.userId,
        datasetId: payload.datasetId,
        datasetVersionId: payload.datasetVersionId,
        originalFilename: "sales.csv",
        mimeType: "text/csv",
        objectKey: payload.objectKey,
        sizeBytes: 12,
        checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="
      }
    })),
    markProfiling: vi.fn(async () => undefined),
    markIndexing: vi.fn(async () => undefined),
    complete: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined)
  } satisfies DatasetIngestionRepository;
  const storage = {
    isReady: vi.fn(async () => true),
    createObjectKey: vi.fn(() => payload.objectKey),
    createPresignedUpload: vi.fn(),
    inspectObject: vi.fn(async () => ({
      sizeBytes: 12,
      contentType: "text/csv",
      checksumSha256: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
      userId: null,
      datasetId: null,
      datasetVersionId: null
    })),
    readObject: vi.fn(async () =>
      (async function* () {
        yield Buffer.from("a,b\n1,2\n");
      })()
    )
  } satisfies ObjectStorage;
  const profiler = {
    profile: vi.fn(async () => profile)
  } satisfies CsvProfiler;
  return {
    repository,
    storage,
    profiler,
    service: new DatasetIngestionService(repository, storage, profiler, 300, () => now)
  };
}

const profile: DatasetProfileContract = {
  version: 1,
  rowCount: 1,
  columnCount: 1,
  encoding: "utf-8",
  delimiter: ",",
  columns: [
    {
      ordinal: 0,
      originalName: "amount",
      canonicalName: "amount",
      inferredType: "integer",
      semanticType: "numeric",
      nullable: false,
      statistics: {
        version: 1,
        nullCount: 0,
        nullPercentage: 0,
        distinctCount: 1,
        min: "1",
        max: "1",
        mean: 1,
        standardDeviation: 0,
        exampleValues: ["1"]
      }
    }
  ],
  warnings: [],
  suggestedPrompts: [
    "Summarize amount.",
    "Which columns contain missing values?",
    "Give me an overview."
  ],
  generatedAt: now.toISOString()
};
